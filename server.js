"use strict"; 

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
//===================================================================

let creds = new AWS.Credentials('accesskey', 'secretkey'); //set AWS CREDENTIALS 


//=======================REQUEST HANDLER FUNCTION ===========================================
function handle(req,res,function_choice,movie){
    let index =0; 
    AWS.config.update({
        region: "eu-west-1",
        credentials: creds 
      });
      
        
    var dynamodb = new AWS.DynamoDB({
        httpOptions: {
            agent: new https.Agent(
                {
                    rejectUnauthorized: true,
                    keepAlive: true,
                    secureProtocol: "TLSv1_method"
                })
        }
    });

//=============================CREATE================================================
    if(function_choice == 0){ // deal with a CREATE REQUEST 
        console.log("Creating database...");
        var params = { //outline table params 
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
        
        //Create table function 
        dynamodb.createTable(params, function(err, data) {
            if (err) {
                console.error("Unable to create table.", JSON.stringify(err, null, 2));           
            } else {
                console.log("> Created table."); 
               
                //Call a function to populate the table 
                //But wait to allow the creation of the table to finished with SLEEP
                //If the table was populated without sleep, most movies would not add for some reason. 
                const sleep = (milliseconds) => {
                    let prom =  new Promise(resolve => setTimeout(resolve, milliseconds));
                    return prom; 
                  }
                  console.log("Please wait while the table is populated...");
                  
                  sleep(1000).then(() => {
                    populateTable().then((data) => { //populate table returns a promise resolution once the table has been fully populated 
                        res.send(data); //upon resolution, tell the client creation and loading of data has completed 
                    }).catch(()=> {
                        res.send("> Error creating table.\n> Try deleting and trying again.");
                    }); 
                  }
                ).catch(() => {
                    console.log("error");
                })
            }
           
        });
        
//=============================QUERY=========================================================    
    } else if (function_choice == 1){ // deal with query  
        var docClient = new AWS.DynamoDB.DocumentClient();   
        let year = parseInt(req.params.year); //get year
        let movie = req.params.movie; //get movie title 
        let set=0,
            result="> Query Results\n> Movies from " + year + " beginning with '" + movie + "'\n__________________________\n"; 
        
        movie = movie.replace(/%20/g, " "); //remove %20 space indications inserted during transmission 
        console.log("> Searching database for: " + movie + " from " + year)

        //Specify the Query Parameters 
        var params = {
            TableName : "Movies",
            KeyConditionExpression: "#yr = :yyyy and begins_with(title, :ss) ", // this is the search condition 
            ExpressionAttributeNames:{
                "#yr": "year"
            },
            ExpressionAttributeValues: {
                ":yyyy": year,
                ":ss": movie
            }
        };

        let prom = new Promise ( (resolve,rej) => { //promise to send response to query 
            docClient.query(params, function(err, data) {
                if (err) {
                    console.log("Unable to query. Error:", JSON.stringify(err, null, 2));
                    res.send("> There was a query error. Consider reloading the database.");
                } else { //the query is successfuly 
                    data.Items.forEach(function(item) { //for each item that matches criteria 
                        index = index + 1; 
                        set = 1; 
                        result = result.concat("\nTitle: ",item.title, "\nMovie Rank: ", item.info.rank, 
                                "\nMovie Rating: ",item.info.rating, "\nDirector: ", 
                                item.info.directors[0], "\n__________________________\n"); //build a resulting string to return to client 
                        //build a result string to store all movies found in the query! 
                        if(index == data.Items.length){ //when we have found all movies that meet the query specifications, resolve the promise 
                            resolve(result); //resolve the promise 
                        } else if (data.Items.length == 0){
                            reject("> There are no movies in the database matching that criteria."); //reject the promise. 
                        }
                        
                    });
                }
                if(set == 0){
                    console.log("That movie is not in the database."); //only print this after the query is completed. i.e. block it from running asynchronously
                    res.send("> There are no movies in the database matching that criteria.");
                }
                set = 0; 
            });
             
        });

        prom.then((result) => { //promise resolves 
            console.log("Promise resolved. Sending response.\n", result);
            res.send(result); //now send the response 
        });
      

 //===========================================destroy=====================================   
    } else { //otherwise it'll be a DESTROY REQUEST 
        console.log("Destroying database...");
        
        //specify table to destroy 
        var params = {
            TableName : "Movies"
        };

        dynamodb.deleteTable(params, function(err, data) {
        if (err) {
            console.error("Unable to delete table. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Table description JSON:", JSON.stringify(data, null, 2), "\n> Table has been deleted.");
            res.send("> Database deleted")
        }
    });
    }
    
}
//===================================================================

//FUNCTION TO POPULATE TABLE ===========================================
function  populateTable(){
    //HERE WE NEED TO ACCESS THE BUCKET AND PULL THE JSON FILE 
    const s3 = new AWS.S3(); 
    let file,ii=0; 
    
    //Access the bucket specifying parameters 
    return new Promise ((resolve, reject)=>{  //promise to send data to client once table has been filled 
    s3.getObject({
            Bucket: 'csu44000assignment2',
            Key: 'moviedata.json'
        }, 
        function(error, data){
            if(error != null){ //ERROR LOADING BUCKET DATA 
                console.log("failed" + error);
            } else { //SUCESSFULLY LOADED BUCKET DATA 
                console.log("> Loaded " + data.Body.length + " bytes ");
                file = data; 
                console.log("Data:\n"); 
                var docClient = new AWS.DynamoDB.DocumentClient();
                
                var allMovies = JSON.parse(data.Body);
                
                    allMovies.forEach(function(movie) {
                        var params = {
                            TableName: "Movies",
                            Item: {
                                "year":  movie.year,
                                "title": movie.title,
                                "info": movie.info
                            }
                        };
                    
                        docClient.put(params, function(err, data) { //Load these items into the Dynamodb       
                             
                            if (err) {
                                console.error("X", ii);
                            } else {    
                                console.log(">", ii, ". ", movie.title, " | ", movie.year);
                                }
                            //check if we reached the last one 

                            ii++;  
                            if(ii == 4609){ //once the table finishes filling up 
                                console.log("|| Finished loading table ||");
                                resolve("> Database created & successfully loaded");
                            }  
                        });
                    });              
                }
            });
        }
    )      
}


app.listen(port, ()=> console.log("Server listening on port 3000"))

