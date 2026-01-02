require('dotenv').config();
const axios = require('axios');

const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error('Error: N8N_WEBHOOK_URL is not set in .env file');
  process.exit(1);
}

async function triggerWorkflow() {
  try {
    console.log(`Triggering n8n workflow at: ${WEBHOOK_URL}`);
    const response = await axios.post(WEBHOOK_URL, {
      triggerSource: 'manual_script',
      timestamp: new Date().toISOString()
    });

    console.log('Success! Workflow triggered.');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Failed to trigger workflow:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

triggerWorkflow();
