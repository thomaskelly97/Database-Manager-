"use strict"; 

const express = require("express")
const cors = require("cors")
const app = express() 
const port = 3000; 
app.use(cors())

//DEAL WITH GET REQUESTS ===========================================
app.get("/", (req, res) => res.send("Server awaiting request...")) //default condition

app.get("/create", (req, res) => handle(req,res,0))
app.get("/query/:movie", (req, res) => handle(req,res,1))
app.get("/destroy", (req, res) => handle(req,res,2))
//===================================================================

//function to parse out the movie name from url
function parseMovie(urlToParse) {
    let movie="";
    for(let i = 7;i<urlToParse.length; i++){
        movie = movie.concat(urlToParse[i]); 
    }
    
    return movie; 
}


//REQUEST HANDLER FUNCTION ===========================================
function handle(req,res,function_choice,movie){
    if(function_choice == 0){ // deal with a CREATE REQUEST 
        console.log("Creating database...");
    } else if (function_choice == 1){ // deal with query    
        let movie = parseMovie(req.originalUrl); //function to parse out the movie name from url 
        console.log("Searching database for: " + movie)
        
    } else { //otherwise it'll be a DESTROY REQUEST 
    console.log("Destroying database...");
    }
    
}
//===================================================================

app.listen(port, ()=> console.log("Server listening on port 3000"))