const firebaseConfig = {
  apiKey: "AIzaSyBQVRNESVgnx7wGEnUSRuPBk8NEl-INjDI",
  authDomain: "slaytionary-mcommerce.firebaseapp.com",
  projectId: "slaytionary-mcommerce",
  storageBucket: "slaytionary-mcommerce.firebasestorage.app",
  messagingSenderId: "527226819921",
  appId: "1:527226819921:web:caac44d79c70721f6baf70"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let allOrders = [];
let allUsers = [];
let allProducts = [];

let pendingDeleteId = null;
let pendingChange = null;
let editingUserId = null;

let adminName = '';
let secondaryApp = null;

// Escape text before displaying it in HTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function money(n) {
  return '₱' + Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function setMsg(el, text, ok) {
  el.style.color = ok ? '#2b8a3e' : '#e03131';
  el.innerText = text;
}

function authErr(err) {
  if (
    [
      'auth/wrong-password',
      'auth/invalid-credential',
      'auth/invalid-login-credentials'
    ].includes(err.code)
  ) {
    return 'Current password is incorrect.';
  }

  if (err.code === 'auth/email-already-in-use') {
    return 'That email is already used.';
  }

  if (err.code === 'auth/weak-password') {
    return 'Password is too weak (min 6 characters).';
  }

  if (err.code === 'auth/requires-recent-login') {
    return 'Please log out and log in again, then retry.';
  }

  return err.message;
}


// ---------- Admin Login ----------

function adminLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');

  errBox.innerText = '';

  auth.signInWithEmailAndPassword(email, password)
    .then(async cred => {
      const ref = db.collection('users').doc(cred.user.uid);
      const doc = await ref.get();

      if (!doc.exists) {
        await auth.signOut();
        errBox.innerText = 'User record not found.';
        return;
      }

      const userData = doc.data();

      if (userData.role !== 'admin') {
        await auth.signOut();
        errBox.innerText = 'Access denied. Admin account only.';
        return;
      }

      if (userData.email !== cred.user.email) {
        ref.update({
          email: cred.user.email
        }).catch(() => {});
      }

      adminName = userData.name || cred.user.email;

      document.getElementById('adminNameLabel').innerText = adminName;
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';

      // Archived functionality removed.
      loadProducts();
      loadOrders();
      loadUsers();

      showSection('home');
    })
    .catch(err => {
      errBox.innerText = err.message;
    });
}

function confirmLogout() {
  document.getElementById('logoutModal').classList.add('show');
}

function closeLogoutModal() {
  document.getElementById('logoutModal').classList.remove('show');
}

function logout() {
  auth.signOut().then(() => location.reload());
}


// ---------- Navigation ----------

function showSection(id) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.add('active');
  }

  if (id === 'account') {
    fillAccount();
  }
}


// ---------- Products ----------

function saveProduct(e) {
  e.preventDefault();

  const editingId = document.getElementById('editingId').value;

  const productData = {
    productName: document.getElementById('pName').value.trim(),
    description: document.getElementById('pDesc').value.trim(),
    price: parseFloat(document.getElementById('pPrice').value),
    stock: parseInt(document.getElementById('pStock').value, 10),
    imageUrl: document.getElementById('pImage').value.trim()
  };

  if (
    !productData.productName ||
    !Number.isFinite(productData.price) ||
    !Number.isFinite(productData.stock)
  ) {
    alert('Please enter a valid product name, price, and stock.');
    return;
  }

  const submitBtn = document.getElementById('formSubmitBtn');
  submitBtn.disabled = true;

  const operation = editingId
    ? db.collection('products').doc(editingId).update(productData)
    : db.collection('products').add(productData);

  operation
    .then(() => {
      if (editingId) {
        cancelEdit();
      } else {
        e.target.reset();
      }
    })
    .catch(err => {
      console.error('Saving product failed:', err);
      alert('Failed to save product: ' + err.message);
    })
    .finally(() => {
      submitBtn.disabled = false;
    });
}

function startEdit(id) {
  const product = allProducts.find(p => p.id === id);

  if (!product) {
    alert('Product not found.');
    return;
  }

  document.getElementById('editingId').value = product.id;
  document.getElementById('pName').value = product.productName || '';
  document.getElementById('pDesc').value = product.description || '';
  document.getElementById('pPrice').value = product.price ?? '';
  document.getElementById('pStock').value = product.stock ?? 0;
  document.getElementById('pImage').value = product.imageUrl || '';

  document.getElementById('formSubmitBtn').innerText = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';

  window.scrollTo(0, 0);
}

function cancelEdit() {
  document.getElementById('editingId').value = '';

  const form = document.querySelector('#products form');

  if (form) {
    form.reset();
  }

  document.getElementById('formSubmitBtn').innerText = 'Add Product';
  document.getElementById('cancelEditBtn').style.display = 'none';
}


// ---------- Delete Product ----------

// Opens the existing delete confirmation popup.
function deleteProduct(id) {
  const product = allProducts.find(p => p.id === id);

  if (!product) {
    alert('Product not found. Please refresh the product list and try again.');
    return;
  }

  pendingDeleteId = id;

  const image = document.getElementById('deleteProductImg');

  image.src = product.imageUrl || '';
  image.style.visibility = product.imageUrl ? 'visible' : 'hidden';

  document.getElementById('deleteProductName').innerText =
    product.productName || 'Unnamed product';

  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  pendingDeleteId = null;

  document.getElementById('deleteModal').classList.remove('show');
}

// Permanently deletes the product from the products collection.
async function confirmDeleteProduct() {
  const id = pendingDeleteId;

  if (!id) {
    return;
  }

  const modal = document.getElementById('deleteModal');
  const deleteButton = modal.querySelector('.confirm-btn');
  const cancelButton = modal.querySelector('.cancel-btn');

  deleteButton.disabled = true;
  cancelButton.disabled = true;
  deleteButton.innerText = 'Deleting...';

  try {
    await db.collection('products').doc(id).delete();

    // Close the popup only after Firestore confirms deletion.
    closeDeleteModal();

    alert('Product deleted successfully.');
  } catch (err) {
    console.error('Product deletion failed:', err);

    alert(
      'Failed to delete product: ' + err.message
    );
  } finally {
    deleteButton.disabled = false;
    cancelButton.disabled = false;
    deleteButton.innerText = 'Delete';
  }
}


// ---------- Load and Display Products ----------

function loadProducts() {
  db.collection('products').onSnapshot(
    snap => {
      allProducts = [];

      snap.forEach(doc => {
        allProducts.push({
          id: doc.id,
          ...doc.data()
        });
      });

      renderProducts();
    },
    err => {
      console.error('Loading products failed:', err);
      alert('Failed to load products: ' + err.message);
    }
  );
}

function renderProducts() {
  const searchEl = document.getElementById('productSearch');
  const stockFilterEl = document.getElementById('stockFilter');
  const tbody = document.getElementById('productTable');

  if (!searchEl || !stockFilterEl || !tbody) {
    return;
  }

  const search = searchEl.value.toLowerCase();
  const stockF = stockFilterEl.value;

  tbody.innerHTML = '';

  let lowStock = 0;
  let outOfStock = 0;

  const filtered = allProducts.filter(p => {
    const stock = Number(p.stock || 0);

    const matchesSearch = (p.productName || '')
      .toLowerCase()
      .includes(search);

    const matchesStock =
      !stockF ||
      (stockF === 'out' && stock <= 0) ||
      (stockF === 'low' && stock > 0 && stock <= 10) ||
      (stockF === 'high' && stock > 10);

    return matchesSearch && matchesStock;
  });

  allProducts.forEach(p => {
    const stock = Number(p.stock || 0);

    if (stock > 0 && stock <= 10) {
      lowStock++;
    }

    if (stock <= 0) {
      outOfStock++;
    }
  });

  filtered.forEach(p => {
    const stock = Number(p.stock || 0);

    const tr = document.createElement('tr');

    const imageTd = document.createElement('td');
    const img = document.createElement('img');

    img.className = 'prod-thumb';
    img.src = p.imageUrl || '';
    img.alt = p.productName || 'Product image';
    img.onerror = function () {
      this.style.visibility = 'hidden';
    };

    img.onclick = function () {
      zoomImage(p.imageUrl || '');
    };

    imageTd.appendChild(img);

    const nameTd = document.createElement('td');
    nameTd.textContent = p.productName || '';

    const priceTd = document.createElement('td');
    priceTd.textContent = money(p.price);

    const stockTd = document.createElement('td');

    if (stock <= 0) {
      stockTd.className = 'stock-out';
      stockTd.textContent = stock + ' ❌ OUT';
    } else if (stock <= 10) {
      stockTd.className = 'stock-low';
      stockTd.textContent = stock + ' ⚠ LOW';
    } else {
      stockTd.textContent = stock;
    }

    const actionTd = document.createElement('td');

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.onclick = function () {
      startEdit(p.id);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = function () {
      deleteProduct(p.id);
    };

    actionTd.appendChild(editBtn);
    actionTd.appendChild(deleteBtn);

    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(priceTd);
    tr.appendChild(stockTd);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });

  document.getElementById('totalProducts').innerText =
    allProducts.length;

  document.getElementById('lowStockProducts').innerText =
    lowStock;

  document.getElementById('outOfStockProducts').innerText =
    outOfStock;

  renderHome();
}


// ---------- Product Image Zoom ----------

function zoomImage(url) {
  if (!url) {
    return;
  }

  document.getElementById('zoomedImg').src = url;

  document.getElementById('imageZoomModal').classList.add('show');
}

function closeImageZoom() {
  document.getElementById('imageZoomModal').classList.remove('show');
}


// ---------- Orders ----------

function loadOrders() {
  db.collection('orders')
    .orderBy('timestamp', 'desc')
    .onSnapshot(
      snap => {
        allOrders = [];

        snap.forEach(doc => {
          allOrders.push({
            id: doc.id,
            ...doc.data()
          });
        });

        document.getElementById('totalOrders').innerText =
          allOrders.length;

        document.getElementById('pendingOrders').innerText =
          allOrders.filter(o => o.status === 'Pending').length;

        document.getElementById('processingOrders').innerText =
          allOrders.filter(o => o.status === 'Processing').length;

        document.getElementById('deliveredOrders').innerText =
          allOrders.filter(o => o.status === 'Delivered').length;

        renderOrders();
        renderUsers();
        renderHome();
      },
      err => {
        console.error('Loading orders failed:', err);
      }
    );
}

function renderOrders() {
  const search = (
    document.getElementById('orderSearch').value || ''
  ).toLowerCase();

  const statusF = document.getElementById('statusFilter').value;
  const dateF = document.getElementById('dateFilter').value;
  const tbody = document.getElementById('orderTable');

  tbody.innerHTML = '';

  allOrders
    .filter(o =>
      (o.customerName || '').toLowerCase().includes(search)
    )
    .filter(o => !statusF || o.status === statusF)
    .filter(o => {
      if (!dateF) {
        return true;
      }

      if (!o.timestamp) {
        return false;
      }

      return o.timestamp.toDate().toLocaleDateString('en-CA') === dateF;
    })
    .forEach(o => {
      const tr = document.createElement('tr');

      tr.style.cursor = 'pointer';

      tr.onclick = function () {
        viewOrderDetail(o.id);
      };

      const customerTd = document.createElement('td');
      customerTd.textContent = o.customerName || o.userId || '';

      const itemsTd = document.createElement('td');
      itemsTd.textContent = o.items || '—';

      const dateTd = document.createElement('td');
      dateTd.textContent = o.timestamp
        ? o.timestamp.toDate().toLocaleString()
        : '—';

      const totalTd = document.createElement('td');
      totalTd.textContent = money(o.total);

      const statusTd = document.createElement('td');

      statusTd.onclick = function (event) {
        event.stopPropagation();
      };

      const select = document.createElement('select');

      select.className =
        'status-select status-' +
        (o.status || 'pending').toLowerCase();

      ['Pending', 'Processing', 'Delivered'].forEach(status => {
        const option = document.createElement('option');

        option.value = status;
        option.textContent = status;
        option.selected = o.status === status;

        select.appendChild(option);
      });

      select.onchange = function () {
        updateStatus(select, o.id, select.value);
      };

      statusTd.appendChild(select);

      tr.appendChild(customerTd);
      tr.appendChild(itemsTd);
      tr.appendChild(dateTd);
      tr.appendChild(totalTd);
      tr.appendChild(statusTd);

      tbody.appendChild(tr);
    });
}

async function updateStatus(selectEl, orderId, status) {
  try {
    await db.collection('orders').doc(orderId).update({
      status
    });

    selectEl.className =
      'status-select status-' + status.toLowerCase();
  } catch (err) {
    console.error('Updating order status failed:', err);
    alert('Failed to update order status: ' + err.message);
  }
}

function viewOrderDetail(orderId) {
  const o = allOrders.find(x => x.id === orderId);

  if (!o) {
    return;
  }

  document.getElementById('odCustomer').innerText =
    o.customerName || o.userId || '';

  document.getElementById('odDate').innerText =
    o.timestamp ? o.timestamp.toDate().toLocaleString() : '';

  let html = '';

  (o.itemsDetailed || []).forEach(it => {
    html += `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <img
          src="${esc(it.imageUrl)}"
          alt=""
          style="width:40px;height:40px;object-fit:contain;background:#F7F5FC;border-radius:8px;padding:4px;"
        >
        <div>
          <strong>${esc(it.name)}</strong><br>
          ${money(it.price)} x ${esc(it.quantity)}
        </div>
      </div>
    `;
  });

  if (!html) {
    html = '<p>No item details available.</p>';
  }

  if (o.deliveryFee != null) {
    html += `
      <hr>
      <p>
        Subtotal: ${money(o.subtotal)}<br>
        Delivery fee: ${money(o.deliveryFee)}
      </p>
    `;
  }

  if (o.address || o.paymentMethod || o.notes) {
    html += `
      <hr>
      <p><strong>Deliver to:</strong><br>${esc(o.address) || '—'}</p>
      <p><strong>Payment:</strong> ${esc(o.paymentMethod) || '—'}</p>
    `;

    if (o.notes) {
      html += `<p><strong>Notes:</strong> ${esc(o.notes)}</p>`;
    }
  }

  document.getElementById('odItems').innerHTML = html;

  document.getElementById('odTotal').innerText =
    'Total: ' + money(o.total);

  document.getElementById('orderDetailModal').classList.add('show');
}

function closeOrderDetail() {
  document.getElementById('orderDetailModal').classList.remove('show');
}


// ---------- Users ----------

function loadUsers() {
  db.collection('users').onSnapshot(
    snap => {
      allUsers = [];

      snap.forEach(doc => {
        allUsers.push({
          id: doc.id,
          ...doc.data()
        });
      });

      document.getElementById('totalUsers').innerText =
        allUsers.length;

      document.getElementById('totalAdmins').innerText =
        allUsers.filter(u => u.role === 'admin').length;

      const me = auth.currentUser
        ? allUsers.find(u => u.id === auth.currentUser.uid)
        : null;

      if (me && me.name) {
        adminName = me.name;

        document.getElementById('adminNameLabel').innerText =
          adminName;
      }

      renderUsers();
      renderHome();
    },
    err => {
      console.error('Loading users failed:', err);
    }
  );
}

function orderStats(uid) {
  const mine = allOrders.filter(o => o.userId === uid);

  return {
    count: mine.length,
    total: mine.reduce((sum, o) => sum + Number(o.total || 0), 0)
  };
}

function renderUsers() {
  const searchEl = document.getElementById('userSearch');

  if (!searchEl) {
    return;
  }

  const search = (searchEl.value || '').toLowerCase();
  const filterEl = document.getElementById('userFilter');
  const filter = filterEl ? filterEl.value : '';

  const me = auth.currentUser ? auth.currentUser.uid : null;
  const tbody = document.getElementById('userTable');

  tbody.innerHTML = '';

  allUsers
    .filter(u =>
      (u.name || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search)
    )
    .filter(u => {
      if (filter === 'admin') {
        return u.role === 'admin';
      }

      if (filter === 'user') {
        return u.role !== 'admin';
      }

      return true;
    })
    .forEach(u => {
      const isAdminRow = u.role === 'admin';
      const s = orderStats(u.id);

      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = u.name || '';

      if (u.id === me) {
        const you = document.createElement('small');

        you.textContent = ' (you)';
        you.style.color = '#888';

        nameTd.appendChild(you);
      }

      const emailTd = document.createElement('td');
      emailTd.textContent = u.email || '';

      const roleTd = document.createElement('td');
      const roleSelect = document.createElement('select');

      roleSelect.className = 'role-select';

      [
        { value: 'user', label: 'user' },
        { value: 'admin', label: 'admin' }
      ].forEach(role => {
        const option = document.createElement('option');

        option.value = role.value;
        option.textContent = role.label;
        option.selected = u.role === role.value;

        roleSelect.appendChild(option);
      });

      roleSelect.onchange = function () {
        askRoleChange(u.id, roleSelect.value);
      };

      roleTd.appendChild(roleSelect);

      const ordersTd = document.createElement('td');
      ordersTd.textContent = isAdminRow ? '—' : s.count;

      const spentTd = document.createElement('td');
      spentTd.textContent = isAdminRow ? '—' : money(s.total);

      const actionsTd = document.createElement('td');

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = function () {
        openEditName(u.id);
      };

      const resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset password';
      resetBtn.onclick = function () {
        askReset(u.id);
      };

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(resetBtn);

      tr.appendChild(nameTd);
      tr.appendChild(emailTd);
      tr.appendChild(roleTd);
      tr.appendChild(ordersTd);
      tr.appendChild(spentTd);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
}

function askRoleChange(userId, newRole) {
  const u = allUsers.find(x => x.id === userId);

  if (!u) {
    return;
  }

  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("You can't change your own role.");
    renderUsers();
    return;
  }

  pendingChange = {
    type: 'role',
    userId,
    newValue: newRole
  };

  const who = u.name || u.email;

  document.getElementById('changeMsg').innerText =
    newRole === 'admin'
      ? `Make ${who} an admin? They will be able to log in to this dashboard.`
      : `Change ${who} to a regular user? They will lose dashboard access.`;

  document.getElementById('changeModal').classList.add('show');
}

function askReset(userId) {
  const u = allUsers.find(x => x.id === userId);

  if (!u || !u.email) {
    return;
  }

  pendingChange = {
    type: 'reset',
    userId,
    email: u.email
  };

  document.getElementById('changeMsg').innerText =
    `Send a password reset email to ${u.email}? They can choose a new password from the link.`;

  document.getElementById('changeModal').classList.add('show');
}

function closeChangeModal(revert = true) {
  pendingChange = null;

  document.getElementById('changeModal').classList.remove('show');

  if (revert) {
    renderUsers();
  }
}

async function confirmChange() {
  const c = pendingChange;

  closeChangeModal(false);

  if (!c) {
    return;
  }

  try {
    if (c.type === 'reset') {
      await auth.sendPasswordResetEmail(c.email);

      alert('Password reset email sent to ' + c.email);
    } else {
      await db.collection('users').doc(c.userId).update({
        role: c.newValue
      });
    }
  } catch (err) {
    alert('Failed: ' + err.message);
    renderUsers();
  }
}

function openEditName(userId) {
  const u = allUsers.find(x => x.id === userId);

  if (!u) {
    return;
  }

  editingUserId = userId;

  document.getElementById('editNameInput').value = u.name || '';

  document.getElementById('editNameModal').classList.add('show');
}

function closeEditName() {
  editingUserId = null;

  document.getElementById('editNameModal').classList.remove('show');
}

async function saveEditName() {
  const id = editingUserId;

  const name = document.getElementById('editNameInput').value.trim();

  if (!id || !name) {
    return;
  }

  closeEditName();

  try {
    await db.collection('users').doc(id).update({
      name
    });
  } catch (err) {
    alert('Update failed: ' + err.message);
  }
}


// ---------- Add User ----------

async function addUser(e) {
  e.preventDefault();

  const form = e.target;
  const msg = document.getElementById('addUserMsg');

  const name = document.getElementById('uName').value.trim();
  const email = document.getElementById('uEmail').value.trim();
  const password = document.getElementById('uPassword').value;
  const role = document.getElementById('uRole').value;

  msg.style.color = '#888';
  msg.innerText = 'Creating user...';

  try {
    if (!secondaryApp) {
      secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
    }

    const secondaryAuth = secondaryApp.auth();

    const cred = await secondaryAuth.createUserWithEmailAndPassword(
      email,
      password
    );

    await db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      role
    });

    await secondaryAuth.signOut();

    setMsg(
      msg,
      'User created. They can now log in with that email and password.',
      true
    );

    form.reset();
  } catch (err) {
    setMsg(msg, err.message, false);
  }
}


// ---------- Dashboard Home ----------

function barChart(data) {
  const max = Math.max(1, ...data.map(d => d.value));

  return `
    <div style="display:flex;align-items:flex-end;gap:10px;height:150px;">
      ${
        data.map(d => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
            <span style="font-size:12px;font-weight:bold;color:#555;">
              ${d.value}
            </span>
            <div style="width:100%;max-width:46px;height:${Math.round(
              (d.value / max) * 100
            )}px;min-height:2px;background:${d.color};border-radius:6px 6px 0 0;"></div>
            <span style="font-size:11px;color:#888;margin-top:4px;">
              ${d.label}
            </span>
          </div>
        `).join('')
      }
    </div>
  `;
}

function renderHome() {
  if (!document.getElementById('homeRecent')) {
    return;
  }

  document.getElementById('welcomeTitle').innerText =
    'Welcome, ' + (adminName || 'Admin') + '! 👋';

  const count = status =>
    allOrders.filter(o => o.status === status).length;

  const revenue = allOrders
    .filter(o => o.status === 'Delivered')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  document.getElementById('hProducts').innerText = allProducts.length;
  document.getElementById('hUsers').innerText = allUsers.length;
  document.getElementById('hOrders').innerText = allOrders.length;
  document.getElementById('hPending').innerText = count('Pending');
  document.getElementById('hProcessing').innerText = count('Processing');
  document.getElementById('hDelivered').innerText = count('Delivered');
  document.getElementById('hRevenue').innerText = money(revenue);

  document.getElementById('chartStatus').innerHTML = barChart([
    {
      label: 'Pending',
      value: count('Pending'),
      color: '#f6c344'
    },
    {
      label: 'Processing',
      value: count('Processing'),
      color: '#6aa7f8'
    },
    {
      label: 'Delivered',
      value: count('Delivered'),
      color: '#4cc38a'
    }
  ]);

  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();

    d.setDate(d.getDate() - i);

    const key = d.toLocaleDateString('en-CA');

    days.push({
      label: d.toLocaleDateString(undefined, {
        weekday: 'short'
      }),
      value: allOrders.filter(o =>
        o.timestamp &&
        o.timestamp.toDate().toLocaleDateString('en-CA') === key
      ).length,
      color: '#8E7CF0'
    });
  }

  document.getElementById('chartDays').innerHTML = barChart(days);

  const recent = document.getElementById('homeRecent');

  recent.innerHTML = '';

  allOrders.slice(0, 5).forEach(o => {
    const tr = document.createElement('tr');

    tr.style.cursor = 'pointer';

    tr.onclick = function () {
      viewOrderDetail(o.id);
    };

    const values = [
      o.customerName || o.userId || '',
      o.items || '—',
      o.timestamp ? o.timestamp.toDate().toLocaleString() : '—',
      o.paymentMethod || '—',
      o.address || '—',
      money(o.total)
    ];

    values.forEach(value => {
      const td = document.createElement('td');

      td.textContent = value;

      tr.appendChild(td);
    });

    const statusTd = document.createElement('td');
    const statusSpan = document.createElement('span');

    statusSpan.className =
      'status-' + (o.status || 'pending').toLowerCase();

    statusSpan.style.cssText =
      'padding:4px 10px;border-radius:6px;font-size:12px;font-weight:bold;';

    statusSpan.textContent = o.status || 'Pending';

    statusTd.appendChild(statusSpan);
    tr.appendChild(statusTd);

    recent.appendChild(tr);
  });

  if (!allOrders.length) {
    recent.innerHTML =
      '<tr><td colspan="7" style="color:#888;">No orders yet.</td></tr>';
  }

  const low = allProducts
    .filter(p => Number(p.stock || 0) <= 10)
    .sort((a, b) =>
      Number(a.stock || 0) - Number(b.stock || 0)
    )
    .slice(0, 10);

  const lowBody = document.getElementById('homeLowStock');

  lowBody.innerHTML = '';

  low.forEach(p => {
    const stock = Number(p.stock || 0);

    const tr = document.createElement('tr');

    const imageTd = document.createElement('td');
    const img = document.createElement('img');

    img.className = 'prod-thumb';
    img.src = p.imageUrl || '';
    img.alt = p.productName || 'Product image';
    img.onerror = function () {
      this.style.visibility = 'hidden';
    };

    imageTd.appendChild(img);

    const nameTd = document.createElement('td');
    nameTd.textContent = p.productName || '';

    const stockTd = document.createElement('td');
    stockTd.className = stock <= 0 ? 'stock-out' : 'stock-low';
    stockTd.textContent = stock;

    const statusTd = document.createElement('td');
    statusTd.className = stock <= 0 ? 'stock-out' : 'stock-low';
    statusTd.textContent =
      stock <= 0 ? '❌ OUT OF STOCK' : '⚠ LOW STOCK';

    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(stockTd);
    tr.appendChild(statusTd);

    lowBody.appendChild(tr);
  });

  if (!low.length) {
    lowBody.innerHTML =
      '<tr><td colspan="4" style="color:#2b8a3e;">All products are well stocked ✅</td></tr>';
  }
}


// ---------- My Account ----------

function fillAccount() {
  const u = auth.currentUser;

  document.getElementById('acctName').value = adminName || '';

  document.getElementById('acctEmailNow').innerText =
    u ? u.email : '';
}

async function saveMyName(e) {
  e.preventDefault();

  const msg = document.getElementById('acctMsgName');

  const name = document.getElementById('acctName').value.trim();

  if (!name) {
    setMsg(msg, 'Name cannot be empty.', false);
    return;
  }

  try {
    await db.collection('users').doc(auth.currentUser.uid).update({
      name
    });

    adminName = name;

    document.getElementById('adminNameLabel').innerText = name;

    renderHome();

    setMsg(msg, 'Name updated.', true);
  } catch (err) {
    setMsg(msg, err.message, false);
  }
}

async function changeMyPassword(e) {
  e.preventDefault();

  const form = e.target;
  const msg = document.getElementById('acctMsgPw');

  const current = document.getElementById('pwCurrent').value;
  const next = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;

  if (next !== confirm) {
    setMsg(msg, 'New passwords do not match.', false);
    return;
  }

  try {
    const user = auth.currentUser;

    await user.reauthenticateWithCredential(
      firebase.auth.EmailAuthProvider.credential(
        user.email,
        current
      )
    );

    await user.updatePassword(next);

    setMsg(msg, 'Password changed.', true);

    form.reset();
  } catch (err) {
    setMsg(msg, authErr(err), false);
  }
}

async function changeMyEmail(e) {
  e.preventDefault();

  const form = e.target;
  const msg = document.getElementById('acctMsgEmail');

  const newEmail = document.getElementById('emNew').value.trim();
  const current = document.getElementById('emPass').value;

  try {
    const user = auth.currentUser;

    await user.reauthenticateWithCredential(
      firebase.auth.EmailAuthProvider.credential(
        user.email,
        current
      )
    );

    await user.verifyBeforeUpdateEmail(newEmail);

    setMsg(
      msg,
      'Verification link sent to ' + newEmail +
      '. Your email changes after you click it. Then log in with the new email.',
      true
    );

    form.reset();
  } catch (err) {
    setMsg(msg, authErr(err), false);
  }
}


// ---------- Build Extra Popups and Pages ----------

(function () {
  const addModal = (id, html) => {
    const d = document.createElement('div');

    d.id = id;
    d.className = 'modal';
    d.innerHTML = '<div class="modal-box">' + html + '</div>';

    document.body.appendChild(d);
  };

  addModal('changeModal', `
    <p id="changeMsg"></p>
    <div class="modal-actions">
      <button onclick="closeChangeModal()" class="cancel-btn">Cancel</button>
      <button onclick="confirmChange()" class="confirm-btn">Confirm</button>
    </div>
  `);

  addModal('editNameModal', `
    <p>Edit user name</p>
    <input
      id="editNameInput"
      style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:8px;"
    >
    <div class="modal-actions">
      <button onclick="closeEditName()" class="cancel-btn">Cancel</button>
      <button onclick="saveEditName()" class="confirm-btn">Save</button>
    </div>
  `);

  // Build the Users page with the fields used by the existing JS.
  document.getElementById('users').innerHTML = `
    <h2>Users</h2>

    <div class="stats-row">
      <div class="stat-card">
        <h4>Total Users</h4>
        <span id="totalUsers">0</span>
      </div>

      <div class="stat-card">
        <h4>Admins</h4>
        <span id="totalAdmins">0</span>
      </div>
    </div>

    <form id="addUserForm" onsubmit="addUser(event)">
      <h4 style="margin:0 0 10px;color:#8E7CF0;">Add User</h4>

      <input id="uName" placeholder="Name" required>
      <input id="uEmail" type="email" placeholder="Email" required>

      <input
        id="uPassword"
        type="password"
        placeholder="Password (min 6 characters)"
        minlength="6"
        required
      >

      <select
        id="uRole"
        style="display:block;width:100%;margin-bottom:10px;padding:10px;border:1px solid #ddd;border-radius:8px;"
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>

      <button type="submit">Add User</button>

      <p id="addUserMsg" style="margin:10px 0 0;font-size:13px;"></p>
    </form>

    <div class="filters">
      <input
        id="userSearch"
        placeholder="Search by name or email..."
        oninput="renderUsers()"
      >

      <select id="userFilter" onchange="renderUsers()">
        <option value="">All Users</option>
        <option value="admin">Admins</option>
        <option value="user">Customers</option>
      </select>
    </div>

    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Orders</th>
          <th>Total Spent</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody id="userTable"></tbody>
    </table>
  `;

  const main = document.querySelector('.main');

  const cardStyle =
    'background:white;border-radius:14px;padding:16px;flex:1;min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.05);';

  const home = document.createElement('section');

  home.id = 'home';
  home.className = 'section';

  home.innerHTML = `
    <h2 id="welcomeTitle">Welcome!</h2>

    <div class="stats-row">
      <div class="stat-card"><h4>Total Products</h4><span id="hProducts">0</span></div>
      <div class="stat-card"><h4>Total Users</h4><span id="hUsers">0</span></div>
      <div class="stat-card"><h4>Total Orders</h4><span id="hOrders">0</span></div>
      <div class="stat-card"><h4>Pending Orders</h4><span id="hPending">0</span></div>
      <div class="stat-card"><h4>Processing Orders</h4><span id="hProcessing">0</span></div>
      <div class="stat-card"><h4>Delivered Orders</h4><span id="hDelivered">0</span></div>
      <div class="stat-card"><h4>Total Revenue (Delivered)</h4><span id="hRevenue">₱0.00</span></div>
    </div>

    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
      <div style="${cardStyle}">
        <h4 style="margin:0 0 10px;color:#888;">Orders by status</h4>
        <div id="chartStatus"></div>
      </div>

      <div style="${cardStyle}">
        <h4 style="margin:0 0 10px;color:#888;">Orders in the last 7 days</h4>
        <div id="chartDays"></div>
      </div>
    </div>

    <h3 style="color:#8E7CF0;">Recent Orders</h3>

    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Products Ordered</th>
          <th>Date</th>
          <th>Payment</th>
          <th>Address</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="homeRecent"></tbody>
    </table>

    <h3 style="color:#8E7CF0;margin-top:28px;">⚠ Low Stock Alert</h3>

    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Name</th>
          <th>Stock</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="homeLowStock"></tbody>
    </table>
  `;

  main.insertBefore(home, main.firstChild);

  const account = document.createElement('section');

  account.id = 'account';
  account.className = 'section';

  account.innerHTML = `
    <h2>My Account</h2>

    <p style="color:#888;margin-top:-8px;">
      Logged in as <strong id="acctEmailNow"></strong>
    </p>

    <form onsubmit="saveMyName(event)">
      <h4 style="margin:0 0 10px;color:#8E7CF0;">Name</h4>
      <input id="acctName" placeholder="Your name" required>
      <button type="submit">Save name</button>
      <p id="acctMsgName" style="margin:10px 0 0;font-size:13px;"></p>
    </form>

    <form onsubmit="changeMyPassword(event)">
      <h4 style="margin:0 0 10px;color:#8E7CF0;">Change password</h4>

      <input id="pwCurrent" type="password" placeholder="Current password" required>
      <input id="pwNew" type="password" placeholder="New password (min 6 characters)" minlength="6" required>
      <input id="pwConfirm" type="password" placeholder="Confirm new password" required>

      <button type="submit">Change password</button>
      <p id="acctMsgPw" style="margin:10px 0 0;font-size:13px;"></p>
    </form>

    <form onsubmit="changeMyEmail(event)">
      <h4 style="margin:0 0 10px;color:#8E7CF0;">Change email</h4>

      <input id="emNew" type="email" placeholder="New email" required>
      <input id="emPass" type="password" placeholder="Current password" required>

      <button type="submit">Send verification link</button>
      <p id="acctMsgEmail" style="margin:10px 0 0;font-size:13px;"></p>
    </form>
  `;

  main.appendChild(account);

  const sb = document.querySelector('.sidebar');

  const btns = sb.querySelectorAll('button');

  const homeBtn = document.createElement('button');

  homeBtn.innerHTML = '🏠 Dashboard';
  homeBtn.onclick = () => showSection('home');

  sb.insertBefore(homeBtn, btns[0]);

  const acctBtn = document.createElement('button');

  acctBtn.innerHTML = '⚙️ My Account';
  acctBtn.onclick = () => showSection('account');

  // Put My Account before Logout.
  sb.insertBefore(acctBtn, sb.lastElementChild);
})();

// END OF app.js
