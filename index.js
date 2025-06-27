
// This code sets up a webhook server using Express and Dialogflow Fulfillment
// It initializes Firebase Admin SDK to interact with Firestore and handles incoming requests from Dialogflow
var admin = require("firebase-admin");

var serviceAccount = require("path/to/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hopebot-25b4f-default-rtdb.firebaseio.com"
});


// Initialize Firestore
// This will allow us to interact with the Firestore database
    const db= admin.firestore();

const express = require('express');
const bodyParser = require('body-parser');
const { WebhookClient } = require('dialogflow-fulfillment');

// Create an Express application
// and set up body-parser middleware to parse JSON requests
const app = express();
app.use(bodyParser.json());

// Define the webhook endpoint
// This endpoint will handle incoming requests from Dialogflow
app.post('/webhook', (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });

    // Define the intent handlers
    // These functions will respond to specific intents from Dialogflow
    function welcome(agent) {
        agent.add('Welcome to HopeBot! How can I help you today?');
    }

    function fallback(agent) {
        agent.add('Sorry, I didn’t get that. Can you try again?');
    }
    function getUserData(agent) {
        const name = agent.parameters.name; // Assuming name is a parameter in the intent
        return db.collection('users').add({name}).then(() => {
            agent.add(`Thanks ${name} , your data has been saved!`);
            }).catch((error) => {
            console.error('Error saving user data:', error);  
            });
            } 

    // Map the intent names to the handler functions
    // This allows Dialogflow to call the correct function based on the intent

    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    agent.handleRequest(intentMap);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server is running on port ${PORT}`));
