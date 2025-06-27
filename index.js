
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
const axios = require('axios');
app.use(express.json());



app.post('/webhook', async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  if (intent === "GetBibleVerse") {
    const verse = req.body.queryResult.parameters['bible_verse'];
    try {
      const response = await axios.get(`https://bible-api.com/${encodeURIComponent(verse)}`);
      const data = response.data;

      const message = `${data.reference} (${data.translation_name}): ${data.text.trim()}`;

      res.json({
        fulfillmentText: message
      });
    } catch (error) {
      res.json({
        fulfillmentText: `Sorry, I couldn't find that verse. Please try another one.`
      });
    }
  } else {
    res.json({ fulfillmentText: "Intent not handled by webhook." });
  }
});

const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');

async function detectIntent(text, sessionId) {
    const sessionClient = new dialogflow.SessionsClient({ keyFilename: 'serviceAccountKey.json' });
    const sessionPath = sessionClient.projectAgentSessionPath('<PROJECT_ID>', sessionId);

    const request = {
        session: sessionPath,
        queryInput: {
            text: {
                text: text,
                languageCode: 'en',
            },
        },
    };

    const responses = await sessionClient.detectIntent(request);
    return responses[0].queryResult.fulfillmentText;
}

const request = require('request');

function sendMessage(recipientId, message) {
    request({
        uri: 'https://graph.facebook.com/v12.0/me/messages',
        qs: { access_token: '<PAGE_ACCESS_TOKEN>' },
        method: 'POST',
        json: {
            recipient: { id: recipientId },
            message: { text: message },
        },
    });
}


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
        agent.add('Sorry , I didn’t get that. Can you try again?');
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

//to handle facebook verification
app.get('/webhook', (req, res) => {
    let VERIFY_TOKEN = 'hopebot_verify';
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

//receive messages and route to dialogflow
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async function(entry) {
            let event = entry.messaging[0];
            let sender = event.sender.id;

            if (event.message && event.message.text) {
                const text = event.message.text;

                // Send text to Dialogflow
                const dialogflowResponse = await detectIntent(text, sender);

                // Send back to Messenger
                sendMessage(sender, dialogflowResponse);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server is running on port ${PORT}`));
