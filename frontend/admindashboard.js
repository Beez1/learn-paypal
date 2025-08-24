// Admin Dashboard JavaScript for Deli Shop
let allOrders = [];

async function loadDashboardData() {
  try {
    showLoading(true);
    const response = await fetch('/api/orders');
    
    if (response.ok) {
      allOrders = await response.json();
      
      if (Array.isArray(allOrders)) {
        updateStats();
        displayOrders();
      } else {
        // Handle case where MongoDB is not connected
        document.getElementById('orders-container').innerHTML = `
          <div class="no-orders">
            <p>${allOrders.message || 'No orders available'}</p>
            <p>Connect MongoDB to view persistent order data.</p>
          </div>
        `;
      }
    } else {
      throw new Error('Failed to fetch orders');
    }
    
    showLoading(false);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showLoading(false);
    document.getElementById('orders-container').innerHTML = `
      <div class="no-orders">
        <p>Error loading orders data</p>
        <p>Please check if the server is running</p>
      </div>
    `;
  }
}

function updateStats() {
  const totalOrders = allOrders.length;
  const totalRevenue = allOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  // Calculate today's orders
  const today = new Date().toDateString();
  const todayOrders = allOrders.filter(order => {
    const orderDate = new Date(order.createdAt).toDateString();
    return orderDate === today;
  }).length;

  document.getElementById('total-orders').textContent = totalOrders;
  document.getElementById('total-revenue').textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById('avg-order').textContent = `$${avgOrder.toFixed(2)}`;
  document.getElementById('today-orders').textContent = todayOrders;
}

function displayOrders() {
  const container = document.getElementById('orders-container');
  
  if (allOrders.length === 0) {
    container.innerHTML = '<div class="no-orders">No orders found</div>';
    return;
  }

  const tableHTML = `
    <table class="orders-table">
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Item</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${allOrders.map(order => {
          const isRefunded = order.status === 'REFUNDED';
          const statusClass = isRefunded ? 'status-refunded' : 'status-completed';
          const statusText = order.status || 'COMPLETED';
          
          return `
            <tr>
              <td>${order.paypalOrderId || order._id || 'N/A'}</td>
              <td>${order.buyerName || 'N/A'}</td>
              <td>${order.item || 'N/A'}</td>
              <td class="amount">$${(order.amount || 0).toFixed(2)}</td>
              <td><span class="${statusClass}">${statusText}</span></td>
              <td>${new Date(order.createdAt).toLocaleDateString()}</td>
              <td class="actions-cell">
                ${isRefunded 
                  ? `<span style="color: #7f8c8d; font-size: 0.9rem;">Refunded</span>` 
                  : `<button class="refund-btn" onclick="processRefund('${order._id}', '${order.item}', ${order.amount})">Refund</button>`
                }
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHTML;
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

async function processRefund(orderId, itemName, amount) {
  // Confirm refund action
  const confirmed = confirm(`Are you sure you want to refund this order?\n\nItem: ${itemName}\nAmount: $${amount.toFixed(2)}\n\nThis action cannot be undone.`);
  
  if (!confirmed) {
    return;
  }

  try {
    // Disable the refund button to prevent double-clicks
    const refundButton = event.target;
    refundButton.disabled = true;
    refundButton.textContent = 'Processing...';

    const response = await fetch(`/api/refund-order/${orderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Show success message
      alert(`Refund processed successfully!\n\nRefund ID: ${result.refundId}\nAmount: $${result.refundAmount}`);
      
      // Reload the dashboard data to show updated status
      await loadDashboardData();
    } else {
      // Show error message
      alert(`Refund failed: ${result.error || 'Unknown error occurred'}`);
      
      // Re-enable the button
      refundButton.disabled = false;
      refundButton.textContent = 'Refund';
    }
  } catch (error) {
    console.error('Refund error:', error);
    alert('Network error occurred while processing refund. Please try again.');
    
    // Re-enable the button
    const refundButton = event.target;
    refundButton.disabled = false;
    refundButton.textContent = 'Refund';
  }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
});
