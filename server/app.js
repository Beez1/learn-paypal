require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const Product = require('./models/product');
const Order = require('./models/order');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Connect to MongoDB with fallback
const mongoUri = process.env.MONGODB_URI ;
let mongoConnected = false;

mongoose.connect(mongoUri)
  .then(() => {
    console.log('🧠 MongoDB connected');
    mongoConnected = true;
    // Initialize products if none exist (only when DB is connected)
    initializeProducts();
  })
  .catch(err => {
    console.error('❌ DB connection failed:', err.message);
    console.log('💡 Running without database - using in-memory storage');
    console.log('   To enable MongoDB: start MongoDB locally or update MONGODB_URI in .env');
  });

// In-memory product storage for when MongoDB isn't available
let inMemoryProducts = [
  { _id: '1', name: 'Bagel & Cream Cheese', price: 5.99, description: 'Classic NYC deli favorite with fresh cream cheese' },
  { _id: '2', name: 'Turkey Club Sandwich', price: 8.49, description: 'Triple-stacked with premium deli turkey, bacon & avocado' },
  { _id: '3', name: 'Cold Brew Coffee', price: 3.75, description: 'Smooth & refreshing artisan cold brew' },
  { _id: '4', name: 'Caesar Salad', price: 7.25, description: 'Crisp romaine with parmesan & house-made croutons' },
  { _id: '5', name: 'Chocolate Croissant', price: 4.50, description: 'Buttery pastry filled with rich Belgian chocolate' },
  { _id: '6', name: 'Fresh Fruit Bowl', price: 6.99, description: 'Seasonal mixed fruits with honey drizzle' }
];

async function initializeProducts() {
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      await Product.insertMany(inMemoryProducts.map(p => ({
        name: p.name,
        price: p.price,
        description: p.description
      })));
      console.log('🥪 Sample products added to database');
    }
    
    // Fix existing orders with broken captions
    await fixOrderCaptions();
  } catch (error) {
    console.error('Error initializing products:', error.message);
  }
}

async function fixOrderCaptions() {
  try {
    // Find orders with the old caption format (either "undefined" or just "Order for")
    const brokenOrders = await Order.find({
      $or: [
        { orderCaption: { $regex: /Order for undefined/ } },
        { orderCaption: { $regex: /^Order for / } }
      ]
    });
    
    if (brokenOrders.length > 0) {
      console.log(`🔧 Fixing ${brokenOrders.length} orders with broken captions...`);
      
      for (const order of brokenOrders) {
        // Create a clean caption in the new format
        const cleanCaption = `Order paid by ${order.buyerName || 'Customer'} for ${order.item || 'Unknown Item'} $${order.amount || '0.00'}`;
        await Order.updateOne(
          { _id: order._id },
          { 
            orderCaption: cleanCaption,
            updatedAt: new Date()
          }
        );
      }
      
      console.log('✅ Order captions fixed successfully');
    }
  } catch (error) {
    console.error('Error fixing order captions:', error.message);
  }
}

const BASE = 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_SECRET in .env file');
  }
  
  const res = await axios({
    method: 'post',
    url: `${BASE}/v1/oauth2/token`,
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

// 🚀 Get products
app.get('/api/products', async (req, res) => {
  try {
    if (mongoConnected) {
      const products = await Product.find();
      res.json(products);
    } else {
      // Use in-memory products when DB is not available
      res.json(inMemoryProducts);
    }
  } catch (error) {
    console.error('Error fetching products:', error.message);
    // Fallback to in-memory products
    res.json(inMemoryProducts);
  }
});

// 📋 Get all orders (for admin/debugging)
app.get('/api/orders', async (req, res) => {
  try {
    if (mongoConnected) {
      const orders = await Order.find().sort({ createdAt: -1 });
      res.json(orders);
    } else {
      res.json({ message: 'Orders are stored in-memory only. Connect MongoDB to persist orders.' });
    }
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// 🧾 Create PayPal order
app.post('/api/create-order', async (req, res) => {
  try {
    const { itemId } = req.body;
    let product;
    
    if (mongoConnected) {
      product = await Product.findById(itemId);
    } else {
      product = inMemoryProducts.find(p => p._id === itemId);
    }
    
    if (!product) return res.status(404).send('Product not found');

    const token = await getAccessToken();
    const order = await axios.post(`${BASE}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: product.price.toFixed(2) },
        description: product.name,
        custom_id: itemId, // Store the item ID for later reference
        reference_id: `item_${itemId}` // Additional reference
      }]
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    res.json({ id: order.data.id, productName: product.name }); // Include product name in response
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ✅ Capture PayPal payment + store order
app.post('/api/capture-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemId } = req.body;
    const token = await getAccessToken();
    const captureRes = await axios.post(`${BASE}/v2/checkout/orders/${orderId}/capture`, {}, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    const capture = captureRes.data;
    const amount = capture.purchase_units[0].payments.captures[0].amount.value;
    const transactionId = capture.purchase_units[0].payments.captures[0].id;
    const currency = capture.purchase_units[0].payments.captures[0].amount.currency_code;

    // Use the itemId from the frontend to get the product details
    let actualProduct = null;
    if (itemId) {
      if (mongoConnected) {
        actualProduct = await Product.findById(itemId);
      } else {
        actualProduct = inMemoryProducts.find(p => p._id === itemId);
      }
    }
    
    const finalItemName = actualProduct ? actualProduct.name : (capture.purchase_units[0].description || 'Unknown Item');
    
    const customerName = capture.payer.name.given_name + ' ' + capture.payer.name.surname;
    
    // Generate order caption in the requested format
    const orderCaption = `Order paid by ${customerName} for ${finalItemName} $${amount}`;

    const orderData = {
      paypalOrderId: capture.id,
      buyerName: capture.payer.name.given_name,
      buyerEmail: capture.payer.email_address,
      status: capture.status,
      amount: parseFloat(amount),
      item: finalItemName, // Use the corrected item name
      itemDescription: actualProduct ? actualProduct.description : (capture.purchase_units[0].description || 'Unknown Item'),
      orderCaption: orderCaption,
      transactionId: transactionId,
      paymentMethod: 'PayPal',
      currency: currency,
      updatedAt: new Date()
    };

    if (mongoConnected) {
      const order = new Order(orderData);
      await order.save();
      res.json(order);
    } else {
      // Return order data without saving to DB
      console.log('💾 Order captured (in-memory):', orderData);
      res.json(orderData);
    }
  } catch (error) {
    console.error('Capture order error:', error.message);
    res.status(500).json({ error: 'Failed to capture order' });
  }
});

// Products are now initialized in the initializeProducts function above

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🛒 Backend running at http://localhost:${PORT}`)
);
