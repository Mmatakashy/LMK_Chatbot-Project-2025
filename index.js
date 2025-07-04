const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const { WebhookClient } = require('dialogflow-fulfillment');
const dialogflow = require('@google-cloud/dialogflow');
const request = require('request');

const app = express();

// Middleware
app.use(express.json());

// Environment variables validation
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const DIALOGFLOW_PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'hopebot_verify';

if (!FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  process.exit(1);
}
if (!DIALOGFLOW_PROJECT_ID) {
  console.error('DIALOGFLOW_PROJECT_ID environment variable is not set.');
  process.exit(1);
}
if (!FACEBOOK_PAGE_ACCESS_TOKEN) {
  console.error('FACEBOOK_PAGE_ACCESS_TOKEN environment variable is not set.');
  process.exit(1);
}

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hopebot-25b4f-default-rtdb.firebaseio.com"
});
const db = admin.firestore();

// Helper function to detect intent from Dialogflow
async function detectIntent(text, sessionId) {
  const sessionClient = new dialogflow.SessionsClient({ credentials: serviceAccount });
  const sessionPath = sessionClient.projectAgentSessionPath(DIALOGFLOW_PROJECT_ID, sessionId);

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

// Helper function to send message to Facebook Messenger
function sendMessage(recipientId, message) {
  request({
    uri: 'https://graph.facebook.com/v12.0/me/messages',
    qs: { access_token: FACEBOOK_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: {
      recipient: { id: recipientId },
      message: { text: message },
    },
  }, (error, response, body) => {
    if (error) {
      console.error('Error sending message to Facebook:', error);
    } else if (response.statusCode !== 200) {
      console.error('Failed to send message to Facebook:', body);
    }
  });
}

// Dialogflow webhook endpoint using dialogflow-fulfillment
app.post('/webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  function welcome(agent) {
    agent.add('Welcome to HopeBot! How can I help you today?');
  }

  function fallback(agent) {
    agent.add('Sorry, I didn’t get that. Can you try again?');
  }

  async function getUserData(agent) {
    const name = agent.parameters.name;
    try {
      await db.collection('users').add({ name });
      agent.add(`Thanks ${name}, your data has been saved!`);
    } catch (error) {
      console.error('Error saving user data:', error);
      agent.add('Sorry, there was an error saving your data.');
    }
  }

  async function getBibleVerse(agent) {
    const verse = agent.parameters.bible_verse;
    if (!verse || verse.trim() === '') {
      agent.add("I didn't receive a Bible verse to look up. Please try again.");
      return;
    }
    try {
      const apiResponse = await axios.get(`https://bible-api.com/${encodeURIComponent(verse)}`);
      const data = apiResponse.data;
      if (!data || !data.text) {
        agent.add("Sorry, I couldn't find that verse. Please try another one.");
        return;
      }
      const reply = `${data.reference} (${data.translation_name || 'NIV'}): ${data.text.trim()}`;
      agent.add(reply);
    } catch (error) {
      console.error('Error calling Bible API:', error.message || error);
      agent.add("Sorry, I couldn't retrieve that Bible verse due to an error. Please try again later.");
    }
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('GetUserData', getUserData);
  intentMap.set('GetBibleVerse', getBibleVerse);

  agent.handleRequest(intentMap);
});

// Facebook Messenger webhook verification endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Facebook Messenger webhook message receiver and Dialogflow routing
app.post('/messenger-webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender = event.sender.id;

      if (event.message && event.message.text) {
        const text = event.message.text;

        try {
          const dialogflowResponse = await detectIntent(text, sender);
          sendMessage(sender, dialogflowResponse);
        } catch (error) {
          console.error('Error processing message from Messenger:', error);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Alternative Bible API webhook endpoint using book, chapter, verse parameters
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bible API webhook is running on port ${PORT}`);
});
