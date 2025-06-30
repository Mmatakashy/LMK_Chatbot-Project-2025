const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hopebot-368ab.firebaseio.com'
});

const db = admin.firestore();

const express = require('express');
const bodyParser = require('body-parser');
const { WebhookClient } = require('dialogflow-fulfillment');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  function welcome(agent) {
    agent.add('Welcome to HopeBot! How can I help you today?');
  }
  function storeUserData(agent) {
  const name = agent.parameters.name;
  return db.collection('users').add({ name }).then(() => {
    agent.add(`Thanks ${name}, your data has been saved.`);
  }).catch(error => {
    console.error("Error writing to Firestore:", error);
    agent.add("Sorry, I couldn't save your data.");
  });
}


  function fallback(agent) {
    agent.add('Sorry, I didn’t get that. Can you try again?');
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Store User Data', storeUserData);


  agent.handleRequest(intentMap);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server is running on port ${PORT}`));
