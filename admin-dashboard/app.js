
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
let archivedProducts = [];
let pendingArchiveId = null;
let pendingForeverId = null;
let secondaryApp = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function adminLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  auth.signInWithEmailAndPassword(email, password)
    .then(async () => {
      const snapshot = await db.collection('users').where('email', '==', email).get();
      if (snapshot.empty) {
        await auth.signOut();
        document.getElementById('loginError').innerText = "User record not found.";
        return;
      }
      const userData = snapshot.docs[0].data();
      if (userData.role !== "admin") {
        await auth.signOut();
        document.getElementById('loginError').innerText = "Access denied. Admin account only.";
        return;
      }
      document.getElementById('adminNameLabel').innerText = userData.name || email;
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';
      loadProducts();
      loadArchived();
      loadOrders();
      loadUsers();
    })
    .catch(err => { document.getElementById('loginError').innerText = err.message; });
}

function confirmLogout() { document.getElementById('logoutModal').classList.add('show'); }
function closeLogoutModal() { document.getElementById('logoutModal').classList.remove('show'); }
function logout() { auth.signOut().then(() => location.reload()); }

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setTab(id, on) {
  const b = document.getElementById(id);
  b.style.background = on ? '#8E7CF0' : '#e9e6f7';
  b.style.color = on ? 'white' : '#555';
}

function showProductTab(tab) {
  const active = tab === 'active';
  document.getElementById('activeView').style.display = active ? 'block' : 'none';
  document.getElementById('archivedView').style.display = active ? 'none' : 'block';
  setTab('tabActive', active);
  setTab('tabArchived', !active);
}

function saveProduct(e) {
  e.preventDefault();
  const editingId = document.getElementById('editingId').value;
  const productData = {
    productName: document.getElementById('pName').value,
    description: document.getElementById('pDesc').value,
    price: parseFloat(document.getElementById('pPrice').value),
    stock: parseInt(document.getElementById('pStock').value),
    imageUrl: document.getElementById('pImage').value
  };
  if (editingId) {
    db.collection('products').doc(editingId).update(productData).then(cancelEdit);
  } else {
    db.collection('products').add(productData).then(() => e.target.reset());
  }
}

function startEdit(id, name, desc, price, stock, imageUrl) {
  document.getElementById('editingId').value = id;
  document.getElementById('pName').value = name;
  document.getElementById('pDesc').value = desc;
  document.getElementById('pPrice').value = price;
  document.getElementById('pStock').value = stock;
  document.getElementById('pImage').value = imageUrl;
  document.getElementById('formSubmitBtn').innerText = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  window.scrollTo(0, 0);
}

function cancelEdit() {
  document.getElementById('editingId').value = '';
  document.querySelector('#activeView form').reset();
  document.getElementById('formSubmitBtn').innerText = 'Add Product';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

// "Delete" in the product table = soft delete: move to the archivedProducts collection (same ID)
function archiveProduct(id, name, imageUrl) {
  pendingArchiveId = id;
  document.getElementById('archiveProductName').innerText = name;
  document.getElementById('archiveProductImg').src = imageUrl || '';
  document.getElementById('archiveModal').classList.add('show');
}

function closeArchiveModal() {
  pendingArchiveId = null;
  document.getElementById('archiveModal').classList.remove('show');
}

async function confirmArchive() {
  const id = pendingArchiveId;
  const p = allProducts.find(x => x.id === id);
  closeArchiveModal();
  if (!id || !p) return;
  const { id: _omit, ...data } = p;
  const batch = db.batch();
  batch.set(db.collection('archivedProducts').doc(id), {
    ...data,
    archivedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  batch.delete(db.collection('products').doc(id));
  try {
    await batch.commit();
  } catch (err) {
    alert('Delete failed: ' + err.message + '\n\nMake sure the archivedProducts rule was published in Firebase.');
  }
}

// Restore = move it back to products with the same ID
async function restoreProduct(id) {
  const p = archivedProducts.find(x => x.id === id);
  if (!p) return;
  const { id: _omit, archivedAt, ...data } = p;
  const batch = db.batch();
  batch.set(db.collection('products').doc(id), data);
  batch.delete(db.collection('archivedProducts').doc(id));
  try {
    await batch.commit();
  } catch (err) {
    alert('Restore failed: ' + err.message);
  }
}

// Permanent delete (from the Archived tab)
function deleteForever(id, name, imageUrl) {
  pendingForeverId = id;
  document.getElementById('foreverName').innerText = name;
  document.getElementById('foreverImg').src = imageUrl || '';
  document.getElementById('foreverModal').classList.add('show');
}

function closeForeverModal() {
  pendingForeverId = null;
  document.getElementById('foreverModal').classList.remove('show');
}

async function confirmForever() {
  const id = pendingForeverId;
  closeForeverModal();
  if (!id) return;
  try {
    await db.collection('archivedProducts').doc(id).delete();
  } catch (err) {
    alert('Permanent delete failed: ' + err.message);
  }
}

function loadProducts() {
  db.collection('products').onSnapshot(snap => {
    allProducts = [];
    snap.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
    renderProducts();
  });
}

function loadArchived() {
  db.collection('archivedProducts').onSnapshot(snap => {
    archivedProducts = [];
    snap.forEach(doc => archivedProducts.push({ id: doc.id, ...doc.data() }));
    renderArchived();
  }, err => console.error('archivedProducts:', err));
}

function renderProducts() {
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const stockF = document.getElementById('stockFilter').value;
  const tbody = document.getElementById('productTable');
  tbody.innerHTML = '';
  let lowStock = 0, outOfStock = 0;

  const filtered = allProducts.filter(p => {
    const stock = p.stock || 0;
    const matchesSearch = (p.productName || '').toLowerCase().includes(search);
    const matchesStock =
      !stockF ||
      (stockF === 'out' && stock <= 0) ||
      (stockF === 'low' && stock > 0 && stock <= 10) ||
      (stockF === 'high' && stock > 10);
    return matchesSearch && matchesStock;
  });

  allProducts.forEach(p => {
    if ((p.stock || 0) <= 10 && (p.stock || 0) > 0) lowStock++;
    if ((p.stock || 0) <= 0) outOfStock++;
  });

  filtered.forEach(p => {
    const safeName = (p.productName || '').replace(/'/g, "\\'");
    const safeDesc = (p.description || '').replace(/'/g, "\\'");
    const safeImg = (p.imageUrl || '').replace(/'/g, "\\'");
    const stock = p.stock || 0;
    tbody.innerHTML += `<tr>
      <td><img class="prod-thumb" src="${p.imageUrl || ''}" onclick="zoomImage('${safeImg}')" onerror="this.style.visibility='hidden'"></td>
      <td>${esc(p.productName)}</td><td>₱${p.price}</td>
      <td class="${stock <= 0 ? 'stock-out' : stock <= 10 ? 'stock-low' : ''}">${stock}${stock <= 0 ? ' ❌ OUT' : stock <= 10 ? ' ⚠ LOW' : ''}</td>
      <td>
        <button onclick="startEdit('${p.id}', '${safeName}', '${safeDesc}', ${p.price}, ${p.stock}, '${safeImg}')">Edit</button>
        <button class="delete-btn" onclick="archiveProduct('${p.id}', '${safeName}', '${safeImg}')">Delete</button>
      </td>
    </tr>`;
  });

  document.getElementById('totalProducts').innerText = allProducts.length;
  document.getElementById('lowStockProducts').innerText = lowStock;
  document.getElementById('outOfStockProducts').innerText = outOfStock;
}

function renderArchived() {
  document.getElementById('archivedCount').innerText = archivedProducts.length;
  const atbody = document.getElementById('archivedTable');
  atbody.innerHTML = '';
  archivedProducts.forEach(p => {
    const safeName = (p.productName || '').replace(/'/g, "\\'");
    const safeImg = (p.imageUrl || '').replace(/'/g, "\\'");
    const when = p.archivedAt && p.archivedAt.toDate ? p.archivedAt.toDate().toLocaleDateString() : '—';
    atbody.innerHTML += `<tr>
      <td><img class="prod-thumb" src="${p.imageUrl || ''}" onclick="zoomImage('${safeImg}')" onerror="this.style.visibility='hidden'"></td>
      <td>${esc(p.productName)}</td><td>₱${p.price}</td><td>${p.stock ?? 0}</td><td>${when}</td>
      <td>
        <button onclick="restoreProduct('${p.id}')">Restore</button>
        <button class="delete-btn" onclick="deleteForever('${p.id}', '${safeName}', '${safeImg}')">Delete permanently</button>
      </td>
    </tr>`;
  });
}

function zoomImage(url) {
  document.getElementById('zoomedImg').src = url;
  document.getElementById('imageZoomModal').classList.add('show');
}

function closeImageZoom() {
  document.getElementById('imageZoomModal').classList.remove('show');
}

function loadOrders() {
  db.collection('orders').orderBy('timestamp', 'desc').onSnapshot(snap => {
    allOrders = [];
    snap.forEach(doc => allOrders.push({ id: doc.id, ...doc.data() }));
    document.getElementById('totalOrders').innerText = allOrders.length;
    document.getElementById('pendingOrders').innerText = allOrders.filter(o => o.status === 'Pending').length;
    document.getElementById('processingOrders').innerText = allOrders.filter(o => o.status === 'Processing').length;
    document.getElementById('deliveredOrders').innerText = allOrders.filter(o => o.status === 'Delivered').length;
    renderOrders();
  });
}

function renderOrders() {
  const search = (document.getElementById('orderSearch').value || '').toLowerCase();
  const statusF = document.getElementById('statusFilter').value;
  const dateF = document.getElementById('dateFilter').value;
  const tbody = document.getElementById('orderTable');
  tbody.innerHTML = '';
  allOrders
    .filter(o => (o.customerName || '').toLowerCase().includes(search))
    .filter(o => !statusF || o.status === statusF)
    .filter(o => {
      if (!dateF) return true;
      if (!o.timestamp) return false;
      return o.timestamp.toDate().toLocaleDateString('en-CA') === dateF;
    })
    .forEach(o => {
      const dateStr = o.timestamp ? o.timestamp.toDate().toLocaleString() : '—';
      tbody.innerHTML += `<tr style="cursor:pointer;" onclick="viewOrderDetail('${o.id}')">
        <td>${esc(o.customerName || o.userId)}</td>
        <td>${esc(o.items) || '—'}</td>
        <td>${dateStr}</td>
        <td>₱${Number(o.total).toFixed(2)}</td>
        <td onclick="event.stopPropagation()">
          <select class="status-select status-${(o.status || 'pending').toLowerCase()}" onchange="updateStatus(this, '${o.id}', this.value)">
            <option ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </td>
      </tr>`;
    });
}

function updateStatus(selectEl, orderId, status) {
  db.collection('orders').doc(orderId).update({ status });
  selectEl.className = 'status-select status-' + status.toLowerCase();
}

function viewOrderDetail(orderId) {
  const o = allOrders.find(x => x.id === orderId);
  if (!o) return;
  document.getElementById('odCustomer').innerText = o.customerName || o.userId;
  document.getElementById('odDate').innerText = o.timestamp ? o.timestamp.toDate().toLocaleString() : '';
  let html = '';
  (o.itemsDetailed || []).forEach(it => {
    html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <img src="${esc(it.imageUrl)}" style="width:40px;height:40px;object-fit:contain;background:#F7F5FC;border-radius:8px;padding:4px;">
      <div><strong>${esc(it.name)}</strong><br>₱${Number(it.price).toFixed(2)} x ${it.quantity}</div>
    </div>`;
  });
  if (!html) html = '<p>No item details available.</p>';
  if (o.deliveryFee != null) {
    html += `<hr><p>Subtotal: ₱${Number(o.subtotal).toFixed(2)}<br>Delivery fee: ₱${Number(o.deliveryFee).toFixed(2)}</p>`;
  }
  if (o.address || o.paymentMethod || o.notes) {
    html += `<hr><p><strong>Deliver to:</strong><br>${esc(o.address) || '—'}</p>
      <p><strong>Payment:</strong> ${esc(o.paymentMethod) || '—'}</p>`;
    if (o.notes) html += `<p><strong>Notes:</strong> ${esc(o.notes)}</p>`;
  }
  document.getElementById('odItems').innerHTML = html;
  document.getElementById('odTotal').innerText = 'Total: ₱' + Number(o.total).toFixed(2);
  document.getElementById('orderDetailModal').classList.add('show');
}

function closeOrderDetail() {
  document.getElementById('orderDetailModal').classList.remove('show');
}

function loadUsers() {
  db.collection('users').onSnapshot(snap => {
    allUsers = [];
    snap.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
    document.getElementById('totalUsers').innerText = allUsers.length;
    document.getElementById('totalAdmins').innerText = allUsers.filter(u => u.role === 'admin').length;
    renderUsers();
  });
}

function renderUsers() {
  const search = (document.getElementById('userSearch').value || '').toLowerCase();
  const tbody = document.getElementById('userTable');
  tbody.innerHTML = '';
  allUsers
    .filter(u => (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search))
    .forEach(u => {
      tbody.innerHTML += `<tr>
        <td>${esc(u.name)}</td><td>${esc(u.email)}</td>
        <td>
          <select class="role-select" onchange="updateRole('${u.id}', this.value)">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
      </tr>`;
    });
}

function updateRole(userId, role) { db.collection('users').doc(userId).update({ role }); }

// Creates the login through a second hidden Firebase connection so the admin stays logged in
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
    if (!secondaryApp) secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
    const secondaryAuth = secondaryApp.auth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({ name, email, role });
    await secondaryAuth.signOut();
    msg.style.color = '#2b8a3e';
    msg.innerText = 'User created. They can now log in with that email and password.';
    form.reset();
  } catch (err) {
    msg.style.color = '#e03131';
    msg.innerText = err.message;
  }
}

// Wording for the Delete popup / Archived tab, and the permanent-delete popup
(function () {
  const title = document.querySelector('#archiveModal .modal-box > p:nth-of-type(1)');
  if (title) title.innerText = 'Delete this product?';
  const note = document.querySelector('#archiveModal .modal-box > p:nth-of-type(2)');
  if (note) note.innerText = 'It moves to the Archived tab and is removed from the shop in the mobile app (customers with it in their cart see "No longer available"). You can restore it, or delete it permanently from the Archived tab.';
  const btn = document.querySelector('#archiveModal .confirm-btn');
  if (btn) btn.innerText = 'Delete';
  const tabNote = document.querySelector('#archivedView > p');
  if (tabNote) tabNote.innerText = 'Deleted products wait here. They are removed from the shop in the mobile app. Restore brings them back, or delete them permanently.';

  const fm = document.createElement('div');
  fm.id = 'foreverModal';
  fm.className = 'modal';
  fm.innerHTML = `<div class="modal-box">
    <p>Delete permanently?</p>
    <img id="foreverImg" class="prod-thumb" style="width:60px;height:60px;margin:10px auto;display:block;">
    <strong id="foreverName"></strong>
    <p style="font-size:12px;color:#e03131;margin-top:10px;">This removes it for good and cannot be undone.</p>
    <div class="modal-actions">
      <button onclick="closeForeverModal()" class="cancel-btn">Cancel</button>
      <button onclick="confirmForever()" class="confirm-btn" style="background:#e03131;">Delete permanently</button>
    </div>
  </div>`;
  document.body.appendChild(fm);
})();
