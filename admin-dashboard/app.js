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

let allOrders = [], allUsers = [], allProducts = [], archivedProducts = [];
let pendingArchiveId = null, pendingForeverId = null, pendingChange = null, editingUserId = null;
let adminName = '';
let secondaryApp = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function money(n) {
  return '₱' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function setMsg(el, text, ok) {
  el.style.color = ok ? '#2b8a3e' : '#e03131';
  el.innerText = text;
}
function authErr(err) {
  if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(err.code)) return 'Current password is incorrect.';
  if (err.code === 'auth/email-already-in-use') return 'That email is already used.';
  if (err.code === 'auth/weak-password') return 'Password is too weak (min 6 characters).';
  if (err.code === 'auth/requires-recent-login') return 'Please log out and log in again, then retry.';
  return err.message;
}

function adminLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
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
      if (userData.email !== cred.user.email) ref.update({ email: cred.user.email }).catch(() => {});
      adminName = userData.name || cred.user.email;
      document.getElementById('adminNameLabel').innerText = adminName;
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';
      loadProducts();
      loadArchived();
      loadOrders();
      loadUsers();
      showSection('home');
    })
    .catch(err => { errBox.innerText = err.message; });
}

function confirmLogout() { document.getElementById('logoutModal').classList.add('show'); }
function closeLogoutModal() { document.getElementById('logoutModal').classList.remove('show'); }
function logout() { auth.signOut().then(() => location.reload()); }

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'account') fillAccount();
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

// ---------- Products ----------
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

// "Delete" = move the product to archivedProducts (same ID); permanent delete is in the Archived tab
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
  batch.set(db.collection('archivedProducts').doc(id), { ...data, archivedAt: firebase.firestore.FieldValue.serverTimestamp() });
  batch.delete(db.collection('products').doc(id));
  try { await batch.commit(); }
  catch (err) { alert('Delete failed: ' + err.message); }
}
async function restoreProduct(id) {
  const p = archivedProducts.find(x => x.id === id);
  if (!p) return;
  const { id: _omit, archivedAt, ...data } = p;
  const batch = db.batch();
  batch.set(db.collection('products').doc(id), data);
  batch.delete(db.collection('archivedProducts').doc(id));
  try { await batch.commit(); }
  catch (err) { alert('Restore failed: ' + err.message); }
}
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
  try { await db.collection('archivedProducts').doc(id).delete(); }
  catch (err) { alert('Permanent delete failed: ' + err.message); }
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
    const matchesStock = !stockF ||
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
  renderHome();
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

// ---------- Orders ----------
function loadOrders() {
  db.collection('orders').orderBy('timestamp', 'desc').onSnapshot(snap => {
    allOrders = [];
    snap.forEach(doc => allOrders.push({ id: doc.id, ...doc.data() }));
    document.getElementById('totalOrders').innerText = allOrders.length;
    document.getElementById('pendingOrders').innerText = allOrders.filter(o => o.status === 'Pending').length;
    document.getElementById('processingOrders').innerText = allOrders.filter(o => o.status === 'Processing').length;
    document.getElementById('deliveredOrders').innerText = allOrders.filter(o => o.status === 'Delivered').length;
    renderOrders();
    renderUsers();
    renderHome();
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

// ---------- Users ----------
function loadUsers() {
  db.collection('users').onSnapshot(snap => {
    allUsers = [];
    snap.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
    document.getElementById('totalUsers').innerText = allUsers.length;
    document.getElementById('totalAdmins').innerText = allUsers.filter(u => u.role === 'admin').length;
    const me = auth.currentUser ? allUsers.find(u => u.id === auth.currentUser.uid) : null;
    if (me && me.name) {
      adminName = me.name;
      document.getElementById('adminNameLabel').innerText = adminName;
    }
    renderUsers();
    renderHome();
  });
}

function orderStats(uid) {
  const mine = allOrders.filter(o => o.userId === uid);
  return { count: mine.length, total: mine.reduce((s, o) => s + Number(o.total || 0), 0) };
}

function renderUsers() {
  const searchEl = document.getElementById('userSearch');
  if (!searchEl) return;
  const search = (searchEl.value || '').toLowerCase();
  const filter = document.getElementById('userFilter').value;
  const me = auth.currentUser ? auth.currentUser.uid : null;
  const tbody = document.getElementById('userTable');
  tbody.innerHTML = '';
  allUsers
    .filter(u => (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search))
    .filter(u => {
      if (filter === 'admin') return u.role === 'admin';
      if (filter === 'user') return u.role !== 'admin';
      return true;
    })
    .forEach(u => {
      const isAdminRow = u.role === 'admin';
      const s = orderStats(u.id);
      tbody.innerHTML += `<tr>
        <td>${esc(u.name)}${u.id === me ? ' <small style="color:#888;">(you)</small>' : ''}</td>
        <td>${esc(u.email)}</td>
        <td>
          <select class="role-select" onchange="askRoleChange('${u.id}', this.value)">
            <option value="user" ${isAdminRow ? '' : 'selected'}>user</option>
            <option value="admin" ${isAdminRow ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td>${isAdminRow ? '—' : s.count}</td>
        <td>${isAdminRow ? '—' : '₱' + s.total.toFixed(2)}</td>
        <td>
          <button onclick="openEditName('${u.id}')">Edit</button>
          <button onclick="askReset('${u.id}')">Reset password</button>
        </td>
      </tr>`;
    });
}

function askRoleChange(userId, newRole) {
  const u = allUsers.find(x => x.id === userId);
  if (!u) return;
  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("You can't change your own role.");
    renderUsers();
    return;
  }
  pendingChange = { type: 'role', userId, newValue: newRole };
  const who = u.name || u.email;
  document.getElementById('changeMsg').innerText = newRole === 'admin'
    ? `Make ${who} an admin? They will be able to log in to this dashboard.`
    : `Change ${who} to a regular user? They will lose dashboard access.`;
  document.getElementById('changeModal').classList.add('show');
}

function askReset(userId) {
  const u = allUsers.find(x => x.id === userId);
  if (!u || !u.email) return;
  pendingChange = { type: 'reset', userId, email: u.email };
  document.getElementById('changeMsg').innerText = `Send a password reset email to ${u.email}? They can choose a new password from the link.`;
  document.getElementById('changeModal').classList.add('show');
}

function closeChangeModal(revert = true) {
  pendingChange = null;
  document.getElementById('changeModal').classList.remove('show');
  if (revert) renderUsers();
}

async function confirmChange() {
  const c = pendingChange;
  closeChangeModal(false);
  if (!c) return;
  try {
    if (c.type === 'reset') {
      await auth.sendPasswordResetEmail(c.email);
      alert('Password reset email sent to ' + c.email);
    } else {
      await db.collection('users').doc(c.userId).update({ role: c.newValue });
    }
  } catch (err) {
    alert('Failed: ' + err.message);
    renderUsers();
  }
}

function openEditName(userId) {
  const u = allUsers.find(x => x.id === userId);
  if (!u) return;
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
  if (!id || !name) return;
  closeEditName();
  try { await db.collection('users').doc(id).update({ name }); }
  catch (err) { alert('Update failed: ' + err.message); }
}

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
    setMsg(msg, 'User created. They can now log in with that email and password.', true);
    form.reset();
  } catch (err) {
    setMsg(msg, err.message, false);
  }
}

// ---------- Dashboard home ----------
function barChart(data) {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:150px;">` +
    data.map(d => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
      <span style="font-size:12px;font-weight:bold;color:#555;">${d.value}</span>
      <div style="width:100%;max-width:46px;height:${Math.round((d.value / max) * 100)}px;min-height:2px;background:${d.color};border-radius:6px 6px 0 0;"></div>
      <span style="font-size:11px;color:#888;margin-top:4px;">${d.label}</span>
    </div>`).join('') + `</div>`;
}

function renderHome() {
  if (!document.getElementById('homeRecent')) return;
  document.getElementById('welcomeTitle').innerText = 'Welcome, ' + (adminName || 'Admin') + '! 👋';
  const count = s => allOrders.filter(o => o.status === s).length;
  const revenue = allOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + Number(o.total || 0), 0);

  document.getElementById('hProducts').innerText = allProducts.length;
  document.getElementById('hUsers').innerText = allUsers.length;
  document.getElementById('hOrders').innerText = allOrders.length;
  document.getElementById('hPending').innerText = count('Pending');
  document.getElementById('hProcessing').innerText = count('Processing');
  document.getElementById('hDelivered').innerText = count('Delivered');
  document.getElementById('hRevenue').innerText = money(revenue);

  document.getElementById('chartStatus').innerHTML = barChart([
    { label: 'Pending', value: count('Pending'), color: '#f6c344' },
    { label: 'Processing', value: count('Processing'), color: '#6aa7f8' },
    { label: 'Delivered', value: count('Delivered'), color: '#4cc38a' }
  ]);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      value: allOrders.filter(o => o.timestamp && o.timestamp.toDate().toLocaleDateString('en-CA') === key).length,
      color: '#8E7CF0'
    });
  }
  document.getElementById('chartDays').innerHTML = barChart(days);

  const recent = document.getElementById('homeRecent');
  recent.innerHTML = '';
  allOrders.slice(0, 5).forEach(o => {
    const dateStr = o.timestamp ? o.timestamp.toDate().toLocaleString() : '—';
    recent.innerHTML += `<tr style="cursor:pointer;" onclick="viewOrderDetail('${o.id}')">
      <td>${esc(o.customerName || o.userId)}</td>
      <td>${esc(o.items) || '—'}</td>
      <td>${dateStr}</td>
      <td>${esc(o.paymentMethod) || '—'}</td>
      <td>${esc(o.address) || '—'}</td>
      <td>₱${Number(o.total).toFixed(2)}</td>
      <td><span class="status-${(o.status || 'pending').toLowerCase()}" style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:bold;">${esc(o.status || 'Pending')}</span></td>
    </tr>`;
  });
  if (!allOrders.length) recent.innerHTML = '<tr><td colspan="7" style="color:#888;">No orders yet.</td></tr>';

  const low = allProducts.filter(p => (p.stock || 0) <= 10).sort((a, b) => (a.stock || 0) - (b.stock || 0)).slice(0, 10);
  const lowBody = document.getElementById('homeLowStock');
  lowBody.innerHTML = '';
  low.forEach(p => {
    const stock = p.stock || 0;
    const cls = stock <= 0 ? 'stock-out' : 'stock-low';
    lowBody.innerHTML += `<tr>
      <td><img class="prod-thumb" src="${esc(p.imageUrl)}" onerror="this.style.visibility='hidden'"></td>
      <td>${esc(p.productName)}</td>
      <td class="${cls}">${stock}</td>
      <td class="${cls}">${stock <= 0 ? '❌ OUT OF STOCK' : '⚠ LOW STOCK'}</td>
    </tr>`;
  });
  if (!low.length) lowBody.innerHTML = '<tr><td colspan="4" style="color:#2b8a3e;">All products are well stocked ✅</td></tr>';
}

// ---------- My Account (the logged-in admin) ----------
function fillAccount() {
  const u = auth.currentUser;
  document.getElementById('acctName').value = adminName || '';
  document.getElementById('acctEmailNow').innerText = u ? u.email : '';
}

async function saveMyName(e) {
  e.preventDefault();
  const msg = document.getElementById('acctMsgName');
  const name = document.getElementById('acctName').value.trim();
  if (!name) { setMsg(msg, 'Name cannot be empty.', false); return; }
  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ name });
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
  if (next !== document.getElementById('pwConfirm').value) { setMsg(msg, 'New passwords do not match.', false); return; }
  try {
    const user = auth.currentUser;
    await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, current));
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
    await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, current));
    await user.verifyBeforeUpdateEmail(newEmail);
    setMsg(msg, 'Verification link sent to ' + newEmail + '. Your email changes after you click it. Then log in with the new email.', true);
    form.reset();
  } catch (err) {
    setMsg(msg, authErr(err), false);
  }
}

// ---------- Builds the extra popups and pages (so index.html stays the same) ----------
(function () {
  const title = document.querySelector('#archiveModal .modal-box > p:nth-of-type(1)');
  if (title) title.innerText = 'Delete this product?';
  const note = document.querySelector('#archiveModal .modal-box > p:nth-of-type(2)');
  if (note) note.innerText = 'It moves to the Archived tab and is removed from the shop in the mobile app (customers with it in their cart see "No longer available"). You can restore it, or delete it permanently from the Archived tab.';
  const btn = document.querySelector('#archiveModal .confirm-btn');
  if (btn) btn.innerText = 'Delete';
  const tabNote = document.querySelector('#archivedView > p');
  if (tabNote) tabNote.innerText = 'Deleted products wait here. They are removed from the shop in the mobile app. Restore brings them back, or delete them permanently.';

  const addModal = (id, html) => {
    const d = document.createElement('div');
    d.id = id;
    d.className = 'modal';
    d.innerHTML = '<div class="modal-box">' + html + '</div>';
    document.body.appendChild(d);
  };

  addModal('foreverModal', `
    <p>Delete permanently?</p>
    <img id="foreverImg" class="prod-thumb" style="width:60px;height:60px;margin:10px auto;display:block;">
    <strong id="foreverName"></strong>
    <p style="font-size:12px;color:#e03131;margin-top:10px;">This removes it for good and cannot be undone.</p>
    <div class="modal-actions">
      <button onclick="closeForeverModal()" class="cancel-btn">Cancel</button>
      <button onclick="confirmForever()" class="confirm-btn" style="background:#e03131;">Delete permanently</button>
    </div>`);

  addModal('changeModal', `
    <p id="changeMsg"></p>
    <div class="modal-actions">
      <button onclick="closeChangeModal()" class="cancel-btn">Cancel</button>
      <button onclick="confirmChange()" class="confirm-btn">Confirm</button>
    </div>`);

  addModal('editNameModal', `
    <p>Edit user name</p>
    <input id="editNameInput" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:8px;">
    <div class="modal-actions">
      <button onclick="closeEditName()" class="cancel-btn">Cancel</button>
      <button onclick="saveEditName()" class="confirm-btn">Save</button>
    </div>`);

  document.getElementById('users').innerHTML = `
    <h2>Users</h2>
    <div class="stats-row">
      <div class="stat-card"><h4>Total Users</h4><span id="totalUsers">0</span></div>
      <div class="stat-card"><h4>Admins</h4><span id="totalAdmins">0</span></div>
    </div>
    <form id="addUserForm" onsubmit="addUser(event)">
      <h4 style="margin:0 0 10px;color:#8E7CF0;">Add User</h4>
      <input id="uName" placeholder="Name" required>
      <input id="uEmail" type="email" placeholder="Email" required>
      <input id="uPassword" type="password" placeholder="Password (min 6 characters)" minlength="6" required>
      <select id="uRole" style="display:block;width:100%;margin-bottom:10px;padding:10px;border:1px solid #ddd;border-radius:8px;">
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button type="submit">Add User</button>
      <p id="addUserMsg" style="margin:10px 0 0;font-size:13px;"></p>
    </form>
    <div class="filters">
      <input id="userSearch" placeholder="Search by name or email..." oninput="renderUsers()">
      <select id="userFilter" onchange="renderUsers()">
        <option value="">All Users</option>
        <option value="admin">Admins</option>
        <option value="user">Customers</option>
      </select>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Orders</th><th>Total Spent</th><th>Actions</th></tr></thead>
      <tbody id="userTable"></tbody>
    </table>`;

  const main = document.querySelector('.main');
  const cardStyle = 'background:white;border-radius:14px;padding:16px;flex:1;min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.05);';

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
      <div style="${cardStyle}"><h4 style="margin:0 0 10px;color:#888;">Orders by status</h4><div id="chartStatus"></div></div>
      <div style="${cardStyle}"><h4 style="margin:0 0 10px;color:#888;">Orders in the last 7 days</h4><div id="chartDays"></div></div>
    </div>
    <h3 style="color:#8E7CF0;">Recent Orders</h3>
    <table>
      <thead><tr><th>Customer</th><th>Products Ordered</th><th>Date</th><th>Payment</th><th>Address</th><th>Total</th><th>Status</th></tr></thead>
      <tbody id="homeRecent"></tbody>
    </table>
    <h3 style="color:#8E7CF0;margin-top:28px;">⚠ Low Stock Alert</h3>
    <table>
      <thead><tr><th>Image</th><th>Name</th><th>Stock</th><th>Status</th></tr></thead>
      <tbody id="homeLowStock"></tbody>
    </table>`;
  main.insertBefore(home, main.firstChild);

  const account = document.createElement('section');
  account.id = 'account';
  account.className = 'section';
  account.innerHTML = `
    <h2>My Account</h2>
    <p style="color:#888;margin-top:-8px;">Logged in as <strong id="acctEmailNow"></strong></p>
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
    </form>`;
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
  sb.insertBefore(acctBtn, btns[btns.length - 1]);
})();

// END OF app.js
