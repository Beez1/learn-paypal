require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const BASE_URL = 'https://api-m.sandbox.paypal.com'; // Use api-m.paypal.com for live

// Step 1: Get OAuth Token
async function getAccessToken() {
  const res = await axios({
    method: 'post',
    url: `${BASE_URL}/v1/oauth2/token`,
    auth: {
      username: process.env.PAYPAL_CLIENT_ID,
      password: process.env.PAYPAL_SECRET,
    },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: 'grant_type=client_credentials',
  });
  return res.data.access_token;
}

// Step 2: Create Order
app.post('/api/create-order', async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    const order = await axios.post(`${BASE_URL}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: '20.00',
        },
        description: 'Cool T-Shirt',
      }]
    }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    res.json(order.data); // Contains the approval URL
  } catch (err) {
    console.error('Create Order Error:', err.response?.data || err.message);
    res.status(500).send('Failed to create order');
  }
});

// Step 3: Capture Payment
app.post('/api/capture-order/:orderId', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const { orderId } = req.params;

    const capture = await axios.post(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    res.json(capture.data);
  } catch (err) {
    console.error('Capture Error:', err.response?.data || err.message);
    res.status(500).send('Failed to capture order');
  }
});

// Start Server
app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
