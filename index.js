const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// ====================
// Active Webhook Code
// ====================

// Main webhook endpoint for Dialogflow to handle Bible verse requests
app.post('/webhook', async (req, res) => {
  console.log('Received webhook request:', JSON.stringify(req.body, null, 2));
  const intent = req.body.queryResult.intent.displayName;

  if (intent === 'GetBibleVerse') {
    const verse = req.body.queryResult.parameters['bible_verse'];

    if (!verse || verse.trim() === '') {
      console.warn('No bible_verse parameter provided');
      return res.json({
        fulfillmentText: "I didn't receive a Bible verse to look up. Please try again."
      });
    }

    try {
      const apiResponse = await axios.get(`https://bible-api.com/${encodeURIComponent(verse)}`);
      const data = apiResponse.data;

      if (!data || !data.text) {
        console.warn('Bible API returned no text for verse:', verse);
        return res.json({
          fulfillmentText: "Sorry, I couldn't find that verse. Please try another one."
        });
      }

      const reply = `${data.reference} (${data.translation_name || 'NIV'}): ${data.text.trim()}`;

      console.log('Sending fulfillment response:', reply);

      res.json({
        fulfillmentText: reply
      });
    } catch (error) {
      console.error('Error calling Bible API:', error.message || error);
      res.json({
        fulfillmentText: "Sorry, I couldn't retrieve that Bible verse due to an error. Please try again later."
      });
    }
  } else {
    console.log('Intent not handled:', intent);
    res.json({
      fulfillmentText: "Intent not handled."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bible API webhook is running on port ${PORT}`);
});

// ====================
// Firebase Admin SDK Initialization for Firestore
// ====================
var admin = require("firebase-admin");
var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hopebot-25b4f-default-rtdb.firebaseio.com"
});
const db = admin.firestore();

// ====================
// Dialogflow Fulfillment Client Setup Example
// ====================
const { WebhookClient } = require('dialogflow-fulfillment');
app.use(express.json());
app.post('/dialogflow-webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  function welcome(agent) {
    agent.add('Welcome to HopeBot! How can I help you today?');
  }

  function fallback(agent) {
    agent.add('Sorry, I didn’t get that. Can you try again?');
  }

  function getUserData(agent) {
    const name = agent.parameters.name; // Assuming name is a parameter in the intent
    return db.collection('users').add({ name }).then(() => {
      agent.add(`Thanks ${name}, your data has been saved!`);
    }).catch((error) => {
      console.error('Error saving user data:', error);
    });
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  // Add other intent handlers here
  agent.handleRequest(intentMap);
});

// ====================
// Facebook Messenger Webhook Verification Endpoint
// ====================
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

// ====================
// Facebook Messenger Webhook Message Receiver and Dialogflow Routing
// ====================
app.post('/messenger-webhook', async (req, res) => {
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

// ====================
// Helper Functions for Dialogflow detectIntent and Facebook sendMessage
// ====================
const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');
async function detectIntent(text, sessionId) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const sessionClient = new dialogflow.SessionsClient({ credentials: serviceAccount });
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

// ====================
// Alternative Bible API Webhook Endpoint Using Book, Chapter, Verse Parameters
// ====================
app.post('/bible-webhook', async (req, res) => {
  try {
    const { book, chapter, verse } = req.body.queryResult.parameters;
    const apiUrl = `https://bible-api.com/${book}+${chapter}:${verse}`;

    const apiResponse = await axios.get(apiUrl);
    const verseData = apiResponse.data;

    res.json({
      fulfillmentText: `${verseData.reference}: ${verseData.text}`,
      source: 'bible-api-webhook'
    });
  } catch (error) {
    console.error(error);
    res.json({ fulfillmentText: "Sorry, I couldn't retrieve that Bible verse." });
  }
});
