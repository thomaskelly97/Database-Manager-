"use strict"; 
//Thomas Kelly - 16323455 
const express = require("express");
const cors = require("cors");
const app = express();
const https = require("https");
var AWS = require("aws-sdk");
var fs = require('fs');

const port = 3000; 
app.use(cors())


//DEAL WITH GET REQUESTS ===========================================
app.get("/", (req, res) => res.send("")) //default condition
app.get("/create", (req, res) => handle(req,res,0))
app.get("/query/:movie/:year", (req, res) => handle(req,res,1))
app.get("/destroy", (req, res) => handle(req,res,2))
app.get("/top", (req, res) => handle(req,res,3))
//===================================================================

const creds = new AWS.Credentials('accesskey', 'secretkey'); //set AWS CREDENTIALS 

///////////////////////////////////////////
const scanParams = {
    TableName: "Movies",
    ProjectionExpression: "#yr, title, info.rating",
    FilterExpression: "#yr between :start_yr and :end_yr and info.rating > :r1", 
    ExpressionAttributeNames: {
        "#yr": "year",
    },
    ExpressionAttributeValues: {
        ":start_yr": 2000,
        ":end_yr": 2014,
        ":r1": 8.5
    }
};

const createParams = { 
    TableName : "Movies",
    KeySchema: [    
        { AttributeName: "year", KeyType: "HASH" },   //partition key 
        { AttributeName: "title", KeyType: "RANGE"}   //sort key 
    ],
    AttributeDefinitions: [       
        { AttributeName: "year", AttributeType: "N" },
        { AttributeName: "title", AttributeType: "S" }
    ],
    BillingMode: "PAY_PER_REQUEST"
};

const deleteParams = {
    TableName : "Movies"
};

////////////////////////////

AWS.config.update({
    region: "eu-west-1",
    credentials: creds 
  });

const dynamodb = new AWS.DynamoDB({
    httpOptions: {
        agent: new https.Agent(
            {
                rejectUnauthorized: true,
                keepAlive: true,
                secureProtocol: "TLSv1_method"
            })
    }
});

async function createDB (params) {
    dynamodb.createTable(params, async (err, data) => {
        if (err) {
            return err;         
        } else {
            try {
                let populateResult = await populateTable();
                return populateResult;  
            } catch {
                return "> Error populating table, please try again."; 
            }
        }
    });
}


function makeQuery (params) {
    const docClient = new AWS.DynamoDB.DocumentClient(); 
    let result = []; 
    
    docClient.query(params, (err, data) => {
        if (err) {
            return "> There was a query error. Consider reloading the database.";
        } 
        if (data.Items.length == 0){
            return "> There are no movies in the database matching that criteria."; 
        }
        data.Items.forEach((item) => { //for each item that matches criteria 
            result.push({title: item.title, rank: item.info.rank, rating: item.info.rating, director: item.info.directors[0]} );
        });
        return result; 
    });
}

function deleteDB (){
    dynamodb.deleteTable(params, (err, data) => {
        if (err) {
            return "> There has been an issue deleting the table."; 
        }            
        return "> Database deleted"
    });
}

function onScan(err, data, params) {
    let gotMoreResults = false, result = []; 
    if (err) {
        return `Unable to scan the table. Error JSON: ${JSON.stringify(err, null, 2)}`;
    } 
    if (data.Items.length === 0){
        return "> There are no movies in the database matching that criteria.";
    }
    data.Items.forEach((movie) => {
        i++;
        result.push({title: movie.title, rating: movie.info.rating});
    });

    if(i === 10 && gotMoreResults === true){ //when we have found all movies that meet the query specifications, resolve the promise 
        return result;
    }  

    if (typeof data.LastEvaluatedKey != "undefined") {
        console.log("Scanning for more...");
        params.ExclusiveStartKey = data.LastEvaluatedKey;
        gotMoreResults = true; 
        docClient.scan(params, onScan);
    }
}

async function handle(req,res,function_choice){ 
    switch (function_choice) {
        case 0: //Create 
            const createResult = await createDB(createParams);
            res.send(createResult);
            break; 

        case 1: //Query 
            const year = parseInt(req.params.year); 
            const movie = req.params.movie; 
            movie = movie.replace(/%20/g, " "); //add whitespace for %20's

            const queryParams = {
                TableName : "Movies",
                KeyConditionExpression: "#yr = :yyyy and begins_with(title, :ss) ", 
                ExpressionAttributeNames:{
                    "#yr": "year"
                },
                ExpressionAttributeValues: {
                    ":yyyy": year,
                    ":ss": movie
                }
            };

            let queryResult = await makeQuery(queryParams);
            res.send(queryResult);
            break; 

        case 2: //Delete 
            const deleteResult = await deleteDB(deleteParams); 
            res.send(deleteResult);
            break; 

        case 3: //Scan 
            const docClient = new AWS.DynamoDB.DocumentClient(); 
            docClient.scan(scanParams, onScan);

            const scanResult = await onScan(err, data, scanParams);
            res.send(scanResult);
            break; 

        default:
            res.send("Bad Request: Consider reloading the table.").status(400);
    }
}


function  populateTable(){
    const s3 = new AWS.S3();  
    
    s3.getObject({
            Bucket: 'csu44000assignment2',
            Key: 'moviedata.json'
        }, (error, data) => {
            if(error != null){ //ERROR LOADING BUCKET DATA 
                return `Table population failed: ${error}`;
            }  
            const docClient = new AWS.DynamoDB.DocumentClient();
            
            const allMovies = JSON.parse(data.Body);
           
            allMovies.forEach((movie) => {
                const populateParams = {
                    TableName: "Movies",
                    Item: {
                        "year":  movie.year,
                        "title": movie.title,
                        "info": movie.info
                    }
                };
                docClient.put(populateParams, (err, data) => { //Load these items into the Dynamodb table          
                    if (err) {
                        return `Atleast one element failed to be inserted, retry table creation: ${err}`;
                    } 
                    if(allMovies.indexOf(movie) === allMovies.length - 1){
                        return "> Database created & successfully loaded";
                    } 
            });
        });
    });      
}

app.listen(port, ()=> console.log(`Server listening on port ${port}`))
