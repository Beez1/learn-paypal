const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  paypalOrderId: String,
  buyerName: String,
  buyerEmail: String,
  status: String,
  amount: Number,
  item: String,
  itemDescription: String,
  orderCaption: String,
  transactionId: String,
  paymentMethod: String,
  currency: String,
  refundId: String,
  refundAmount: Number,
  refundDate: Date,
  refundStatus: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
