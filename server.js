const express = require('express');
const cors = require('cors'); 
const tableRouter = require('./router/tableRouter');

const PORT = 5000;

const app = express();

app.use(cors());


app.use(express.json());

app.use("/api", tableRouter);

app.listen(PORT, () => console.log("Server is running on port", PORT));
