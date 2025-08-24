// Main page JavaScript for Deli Shop
let selectedItemId = null;
let selectedProduct = null;

async function loadProducts() {
  try {
    showLoading(true);
    const res = await fetch('/api/products');
    const products = await res.json();
    const container = document.getElementById('products');
    
    container.innerHTML = '';
    
    products.forEach(product => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card fade-in';
      productCard.innerHTML = `
        <div class="product-name">${product.name}</div>
        <div class="product-price">$${product.price.toFixed(2)}</div>
        <div class="product-description">${product.description}</div>
        <button class="select-btn" onclick="selectProduct('${product._id}', '${product.name}', ${product.price})">
          Select Item
        </button>
      `;
      container.appendChild(productCard);
    });
    
    showLoading(false);
  } catch (error) {
    showError('Failed to load products. Please refresh the page.');
    showLoading(false);
  }
}

function selectProduct(id, name, price) {
  selectedItemId = id;
  selectedProduct = { name, price };
  
  // Update UI to show selection
  document.querySelectorAll('.product-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.target.closest('.product-card').classList.add('selected');
  
  // Show PayPal container
  const paypalContainer = document.getElementById('paypal-container');
  paypalContainer.classList.remove('hidden');
  
  // Update selected item display
  document.querySelector('.selected-item-name').textContent = name;
  document.querySelector('.selected-item-price').textContent = `$${price.toFixed(2)}`;
  
  // Update item icon based on product name
  const itemIcon = getItemIcon(name);
  document.querySelector('.selected-item-icon').textContent = itemIcon;
  
  // Update checkout steps
  updateCheckoutSteps(1);
  
  // Clear and render PayPal button
  document.getElementById('paypal-button-container').innerHTML = '';
  renderPayPalButton();
  
  // Smooth scroll to PayPal section
  paypalContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getItemIcon(itemName) {
  const name = itemName.toLowerCase();
  if (name.includes('bagel')) return '🥯';
  if (name.includes('sandwich') || name.includes('club')) return '🥪';
  if (name.includes('coffee') || name.includes('brew')) return '☕';
  if (name.includes('salad') || name.includes('caesar')) return '🥗';
  if (name.includes('croissant') || name.includes('chocolate')) return '🥐';
  if (name.includes('fruit') || name.includes('bowl')) return '🍓';
  return '🥪'; // default
}

function updateCheckoutSteps(activeStep) {
  const steps = document.querySelectorAll('.checkout-step');
  steps.forEach((step, index) => {
    if (index + 1 <= activeStep) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
}

function renderPayPalButton() {
  paypal.Buttons({
    style: {
      color: 'blue',
      shape: 'pill',
      label: 'pay',
      height: 50
    },
    createOrder: async () => {
      try {
        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: selectedItemId })
        });
        const data = await res.json();
        return data.id;
      } catch (error) {
        showError('Failed to create order. Please try again.');
        throw error;
      }
    },
    onApprove: async (data) => {
      try {
        // Update checkout steps to show payment processing
        updateCheckoutSteps(2);
        showLoading(true);
        
        const res = await fetch(`/api/capture-order/${data.orderID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: selectedItemId })
        });
        const details = await res.json();
        showLoading(false);
        
        // Update checkout steps to completion
        updateCheckoutSteps(3);
        
        // Show success modal instead of alert
        setTimeout(() => {
          showSuccessModal(details);
        }, 500);
        
        // Reset selection after modal is closed
        setTimeout(() => {
          resetSelection();
        }, 1000);
      } catch (error) {
        showLoading(false);
        updateCheckoutSteps(1); // Reset to step 1 on error
        showError('Payment processing failed. Please contact support.');
      }
    },
    onError: err => {
      console.error('PayPal Error:', err);
      showError("Payment failed. Please try again.");
    },
    onCancel: () => {
      showError("Payment cancelled. Feel free to try again!");
    }
  }).render('#paypal-button-container');
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

function showSuccess(message) {
  removeMessages();
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.innerHTML = `<strong>${message}</strong>`;
  document.querySelector('.container').insertBefore(successDiv, document.getElementById('products'));
  
  setTimeout(() => {
    successDiv.remove();
  }, 5000);
}

function showError(message) {
  removeMessages();
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `<strong>${message}</strong>`;
  document.querySelector('.container').insertBefore(errorDiv, document.getElementById('products'));
  
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function removeMessages() {
  document.querySelectorAll('.success-message, .error-message').forEach(msg => msg.remove());
}

function resetSelection() {
  selectedItemId = null;
  selectedProduct = null;
  document.querySelectorAll('.product-card').forEach(card => {
    card.classList.remove('selected');
  });
  document.getElementById('paypal-container').classList.add('hidden');
  removeMessages();
}

// Success Modal Functions
function showSuccessModal(orderDetails) {
  const itemName = orderDetails.item || 'N/A';
  const customerName = orderDetails.buyerName || 'Customer';
  
  // Update dynamic content to feature the item name
  document.getElementById('modal-dynamic-title').textContent = `${itemName} Order Complete!`;
  document.getElementById('modal-dynamic-message').textContent = 
    `Thank you ${customerName}! Your ${itemName} has been successfully ordered and paid for.`;
  
  // Populate modal with order details
  document.getElementById('modal-order-id').textContent = orderDetails.paypalOrderId || orderDetails._id || 'N/A';
  document.getElementById('modal-item-name').textContent = itemName;
  document.getElementById('modal-featured-item').textContent = itemName;
  document.getElementById('modal-amount').textContent = `$${orderDetails.amount || '0.00'}`;
  document.getElementById('modal-customer-name').textContent = customerName;
  document.getElementById('modal-transaction-id').textContent = orderDetails.transactionId || 'N/A';
  document.getElementById('modal-status').textContent = orderDetails.status || 'COMPLETED';
  
  // Show the modal
  document.getElementById('success-modal').classList.remove('hidden');
  
  // Prevent body scrolling
  document.body.style.overflow = 'hidden';
}

function closeSuccessModal() {
  document.getElementById('success-modal').classList.add('hidden');
  document.body.style.overflow = 'auto';
  resetSelection();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  
  // Close modal when clicking overlay
  document.getElementById('success-modal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeSuccessModal();
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSuccessModal();
    }
  });
});
