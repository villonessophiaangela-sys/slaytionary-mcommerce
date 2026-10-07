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
  document.querySelector('#products form').reset();
  document.getElementById('formSubmitBtn').innerText = 'Add Product';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

function deleteProduct(id) { db.collection('products').doc(id).delete(); }

function loadProducts() {
  db.collection('products').onSnapshot(snap => {
    const tbody = document.getElementById('productTable');
    tbody.innerHTML = '';
    snap.forEach(doc => {
      const p = doc.data();
      const safeName = (p.productName || '').replace(/'/g, "\\'");
      const safeDesc = (p.description || '').replace(/'/g, "\\'");
      const safeImg = (p.imageUrl || '').replace(/'/g, "\\'");
      tbody.innerHTML += `<tr>
        <td><img class="prod-thumb" src="${p.imageUrl || ''}" onerror="this.style.visibility='hidden'"></td>
        <td>${p.productName}</td><td>₱${p.price}</td><td>${p.stock}</td>
        <td>
          <button onclick="startEdit('${doc.id}', '${safeName}', '${safeDesc}', ${p.price}, ${p.stock}, '${safeImg}')">Edit</button>
          <button class="delete-btn" onclick="deleteProduct('${doc.id}')">Delete</button>
        </td>
      </tr>`;
    });
  });
}

function loadOrders() {
  db.collection('orders').orderBy('timestamp', 'desc').onSnapshot(snap => {
    allOrders = [];
    snap.forEach(doc => allOrders.push({ id: doc.id, ...doc.data() }));
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
      const d = o.timestamp.toDate();
      const dStr = d.toISOString().slice(0, 10);
      return dStr === dateF;
    })
    .forEach(o => {
      const dateStr = o.timestamp ? o.timestamp.toDate().toLocaleString() : '—';
      tbody.innerHTML += `<tr>
        <td>${o.customerName || o.userId}</td>
        <td>${o.items || '—'}</td>
        <td>${dateStr}</td>
        <td>₱${o.total}</td>
        <td>
          <select class="status-select" onchange="updateStatus('${o.id}', this.value)">
            <option ${o.status==='Pending'?'selected':''}>Pending</option>
            <option ${o.status==='Processing'?'selected':''}>Processing</option>
            <option ${o.status==='Delivered'?'selected':''}>Delivered</option>
          </select>
        </td>
      </tr>`;
    });
}

function updateStatus(orderId, status) { db.collection('orders').doc(orderId).update({ status }); }

function loadUsers() {
  db.collection('users').onSnapshot(snap => {
    allUsers = [];
    snap.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
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
        <td>${u.name || ''}</td><td>${u.email || ''}</td>
        <td>
          <select class="role-select" onchange="updateRole('${u.id}', this.value)">
            <option value="user" ${u.role==='user'?'selected':''}>user</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
          </select>
        </td>
      </tr>`;
    });
}

function updateRole(userId, role) { db.collection('users').doc(userId).update({ role }); }
