const pool = require('../db');
const math = require('mathjs');

/**
 * @param {string} formula
 * @param {function} getCellValue
 */
async function evaluateFormula(formula, getCellValue) {
    let parsedFormula = formula;

    // Find all cell references like A1, B2, etc.
    const cellReferences = formula.match(/[A-Z]+\d+/g) || [];

    for (let ref of cellReferences) {
        try {
            const [row, col] = parseCellReference(ref);
            const value = await getCellValue(row, col);

            // Replace the reference in the formula with the fetched value
            parsedFormula = parsedFormula.replace(ref, value || 0);
        } catch (error) {
            console.error(`Error fetching value for reference ${ref}:`, error);
            parsedFormula = parsedFormula.replace(ref, 0);
        }
    }

    // Now that all cell values are replaced, evaluate the formula
    try {
        return math.evaluate(parsedFormula);
    } catch (error) {
        console.error('Formula evaluation error:', error);
        throw new Error('Invalid formula');
    }
}

/**
 * @param {string} reference
 * @returns {[number, number]}
 */
function parseCellReference(reference) {
    // Parse the column and row from the cell reference (e.g., A1 => [0, 0])
    const column = reference.charCodeAt(0) - 65;
    const row = parseInt(reference.substring(1)) - 1;
    return [row, column];
}

class TableController {
    async createAntity(req, res) {
        const {
            rowIndex,
            columnIndex,
            value,
            formula
        } = req.body;

        try {
            let resultValue = value;
            const type = value.startsWith('=') ? 'formula' : 'static';

            // Evaluate formula if it's a formula
            if (type === 'formula') {
                if (formula.includes("POW")) {
                    // Extract the value inside the parentheses for SQUARE
                    const valueToSquare = formula.match(/\((.*?)\)/)[1];
            
                    // Get the value of the cell referenced in the formula (e.g. A1)
                    resultValue = await evaluateFormula(valueToSquare, (row, col) => {
                        return pool.query(
                            'SELECT value FROM table_structure WHERE row_index = $1 AND column_index = $2',
                            [row, col]
                        ).then(result => result.rows[0]?.value || 0);
                    }).then(value => Math.pow(Number(value), 2)); // Square the value
                }
                // Handle the root formula (ROOT)
                else if (formula.includes("SQRT")) {
                    const matches = formula.match(/\((.*?)\)/);
                    const [expression, root] = matches[1].split(',').map(item => item.trim());

                    // Get the value of the cell referenced in the formula (e.g. A1)
                    resultValue = await evaluateFormula(expression, (row, col) => {
                        return pool.query(
                            'SELECT value FROM table_structure WHERE row_index = $1 AND column_index = $2',
                            [row, col]
                        ).then(result => result.rows[0]?.value || 0);
                    }).then(value => Math.sqrt(Number(value), 1 / Number(root))); // Calculate the n-th root
                } else {
                    // Evaluate other formulas normally
                    resultValue = await evaluateFormula(value.slice(1), (row, col) => {
                        return pool.query(
                            'SELECT value FROM table_structure WHERE row_index = $1 AND column_index = $2',
                            [row, col]
                        ).then(result => result.rows[0]?.value || 0);
                    });
                }
            }

            // Check if the cell already exists
            const existingCell = await pool.query(
                'SELECT * FROM table_structure WHERE row_index = $1 AND column_index = $2',
                [rowIndex, columnIndex]
            );

            if (existingCell.rows.length > 0) {
                // Cell exists, update it
                const formulaToSave = type !== "formula" ? null : formula;
                const updateResult = await pool.query(
                    `UPDATE table_structure
                     SET value = $1, type = $2, formulas = $3
                     WHERE row_index = $4 AND column_index = $5
                     RETURNING *`,
                    [resultValue, type, formulaToSave, rowIndex, columnIndex]
                );
                res.status(200).json(updateResult.rows[0]);
            } else {
                // Cell does not exist, insert a new one
                const formulaToSave = type !== "formula" ? null : formula;
                const insertResult = await pool.query(
                    `INSERT INTO table_structure (row_index, column_index, value, type, formulas)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [rowIndex, columnIndex, resultValue, type, formulaToSave]
                );
                res.status(200).json(insertResult.rows[0]);
            }
        } catch (error) {
            console.error('Error in createAntity:', error);
            res.status(500).json({
                error: 'Failed to update cell'
            });
        }
    }

    async getTable(req, res) {
        try {
            const result = await pool.query(
                'SELECT * FROM table_structure ORDER BY row_index, column_index'
            );
            res.status(200).json(result.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Failed to fetch table data'
            });
        }
    }

    async addRow(req, res) {
        const {
            rowIndex,
            columnsCount
        } = req.body;

        try {
            const queries = [];
            for (let i = 0; i < columnsCount; i++) {
                queries.push(
                    pool.query(
                        'INSERT INTO table_structure (row_index, column_index, value) VALUES ($1, $2, NULL)',
                        [rowIndex, i]
                    )
                );
            }
            await Promise.all(queries);
            res.status(201).json({
                message: 'Row added successfully'
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Failed to add row'
            });
        }
    }

    async addColumn(req, res) {
        const {
            columnsCount
        } = req.body;

        if (columnsCount == null || isNaN(columnsCount)) {
            return res.status(400).json({
                error: 'Invalid columnsCount value'
            });
        }

        try {
            // Get the distinct row indices from the table
            const result = await pool.query('SELECT DISTINCT row_index FROM table_structure ORDER BY row_index');
            const rows = result.rows;

            const queries = [];
            // Insert a new column for each row
            rows.forEach((row) => {
                queries.push(
                    pool.query(
                        'INSERT INTO table_structure (row_index, column_index, value) VALUES ($1, $2, NULL)',
                        [row.row_index, columnsCount]
                    )
                );
            });

            // Execute all queries in parallel
            await Promise.all(queries);
            res.status(201).json({
                message: 'Column added successfully'
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Failed to add column'
            });
        }
    }


}

module.exports = new TableController();