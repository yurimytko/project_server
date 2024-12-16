const Router = require("express");

const router = new Router();

const tableController = require('../controller/tableController');


router.post('/table/cell', tableController.createAntity);
router.get('/table', tableController.getTable);
router.post('/table/row', tableController.addRow);
router.post('/table/column', tableController.addColumn);



module.exports = router;
