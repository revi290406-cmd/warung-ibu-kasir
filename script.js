// ===== ENGINE PWA NETWORK-FIRST (AUTO-UPDATE OFFLINE) =====
if ('serviceWorker' in navigator) {
  const APP_VERSION = 'v5.2-offline-1';
  const swCode = `
    const CACHE_NAME = 'warung-ibu-${APP_VERSION}';

    self.addEventListener('install', e => {
      self.skipWaiting();
    });

    self.addEventListener('activate', e => {
      e.waitUntil(
        caches.keys().then(keys => Promise.all(
          keys.map(key => { if (key !== CACHE_NAME) return caches.delete(key); })
        )).then(() => self.clients.claim())
      );
    });

    self.addEventListener('fetch', e => {
      const request = e.request;
      if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        e.respondWith(
          fetch(request)
            .then(networkResponse => {
              const resCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, resCopy));
              return networkResponse;
            })
            .catch(() => caches.match(request).then(cached => cached || caches.match('./')))
        );
        return;
      }

      e.respondWith(
        caches.match(request).then(cached => {
          return cached || fetch(request).then(response => {
            if (request.method === 'GET' && response.status === 200) {
              const resCopy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, resCopy));
            }
            return response;
          });
        }).catch(() => caches.match('./'))
      );
    });
  `;
  
  try {
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl).then(reg => {
      reg.update();
    }).catch(err => console.log('SW Registration error:', err));
  } catch(e) {}
}

// Dynamic Web App Manifest
const manifestData = {
  "name": "Warung Ibu Kasir Pro",
  "short_name": "WarungIbu",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0b111e",
  "icons": [
    {
      "src": "https://cdn-icons-png.flaticon.com/512/2821/2821870.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
};
const manifestBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/json' });
const manifestURL = URL.createObjectURL(manifestBlob);
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = manifestURL;
document.head.appendChild(manifestLink);

// Install Prompt Handler
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  const hint = document.getElementById('pwa-status-hint');
  if (installBtn) installBtn.classList.remove('hidden');
  if (hint) hint.classList.add('hidden');
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Aplikasi berhasil diinstal!');
      }
      deferredPrompt = null;
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) installBtn.classList.add('hidden');
    });
  } else {
    alert('Aplikasi sudah terinstal atau gunakan menu "Tambahkan ke Layar Utama" di browser Anda.');
  }
}

document.getElementById('current-date').innerText = new Date().toLocaleDateString('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
});

const defaultProducts = [
  { id: 'p1', name: 'Risol Mayo', category: 'Makanan', price: 3000, cogs: 1900, stock: 45 },
  { id: 'p2', name: 'Risol Ayam', category: 'Makanan', price: 2500, cogs: 1200, stock: 30 },
  { id: 'p3', name: 'Es Teh Manis', category: 'Minuman', price: 3000, cogs: 800, stock: 80 },
  { id: 'p4', name: 'Keripik Kaca', category: 'Snack', price: 5000, cogs: 3000, stock: 3 }
];

let allProducts = JSON.parse(localStorage.getItem('warung_ibu_products')) || defaultProducts;
let allTransactions = JSON.parse(localStorage.getItem('warung_ibu_transactions')) || [];
let allDeletedTransactions = JSON.parse(localStorage.getItem('warung_ibu_deleted_transactions')) || [];
let allExpenses = JSON.parse(localStorage.getItem('warung_ibu_expenses')) || [];
let allShiftHistory = JSON.parse(localStorage.getItem('warung_ibu_shifts')) || [];
let dailyTarget = parseInt(localStorage.getItem('warung_ibu_target')) || 300000;
let adminPin = localStorage.getItem('warung_ibu_pin') || null;
let currentShift = JSON.parse(localStorage.getItem('warung_ibu_current_shift')) || null;

let cart = [];
let selectedCategory = 'All';
let currentReportPeriod = 'daily';
let chartInstance = null;
let givenCashAmount = 0;
let currentTheme = localStorage.getItem('warung_ibu_theme') || 'dark';
let activeReceiptTx = null;

function isToday(dateString) {
  const d = new Date(dateString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}

function saveData() {
  localStorage.setItem('warung_ibu_products', JSON.stringify(allProducts));
  localStorage.setItem('warung_ibu_transactions', JSON.stringify(allTransactions));
  localStorage.setItem('warung_ibu_deleted_transactions', JSON.stringify(allDeletedTransactions));
  localStorage.setItem('warung_ibu_expenses', JSON.stringify(allExpenses));
  localStorage.setItem('warung_ibu_shifts', JSON.stringify(allShiftHistory));
  localStorage.setItem('warung_ibu_target', dailyTarget);
  if (adminPin) localStorage.setItem('warung_ibu_pin', adminPin);
  if (currentShift) {
    localStorage.setItem('warung_ibu_current_shift', JSON.stringify(currentShift));
  } else {
    localStorage.removeItem('warung_ibu_current_shift');
  }
  checkLowStock();
  updateTargetUI();
  refreshActiveViews();
}

function refreshActiveViews() {
  const activePage = document.querySelector('.page-content:not(.hidden)');
  if (!activePage) return;
  const id = activePage.id;
  if (id === 'page-kasir') { renderKasirProducts(); renderCartUI(); renderKasirPage(); }
  else if (id === 'page-kasbon') renderKasbonPage();
  else if (id === 'page-produk') renderProductsPage();
  else if (id === 'page-pengeluaran') renderExpensesList();
  else if (id === 'page-laporan') updateReportUI();
  else if (id === 'page-deleted') renderDeletedPage();
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.className = theme;
  localStorage.setItem('warung_ibu_theme', theme);
  const isDark = theme === 'dark';
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const settingsBtn = document.getElementById('settings-theme-btn');
  const statusText = document.getElementById('theme-status-text');
  
  if (toggleBtn) toggleBtn.textContent = isDark ? '🌙' : '☀️';
  if (settingsBtn) settingsBtn.textContent = isDark ? 'Ke Mode Terang' : 'Ke Mode Gelap';
  if (statusText) statusText.textContent = isDark ? 'Mode Gelap aktif' : 'Mode Terang aktif';
  if (chartInstance) updateReportUI();
}

function toggleTheme() {
  triggerFeedback();
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}
applyTheme(currentTheme);

function checkShiftOnLoad() {
  if (!currentShift) {
    document.getElementById('shift-open-modal').classList.remove('hidden');
    document.getElementById('shift-status-btn').classList.add('hidden');
    document.getElementById('sidebar-shift-info').classList.add('hidden');
  } else {
    updateShiftUI();
  }
}

function setShiftModal(val) {
  document.getElementById('shift-modal-amount').value = val;
}

function openShiftConfirm() {
  const modalInput = document.getElementById('shift-modal-amount');
  const amount = parseInt(modalInput.value);
  if (isNaN(amount) || amount < 0) {
    alert('Masukkan nominal modal awal yang valid!');
    return;
  }
  currentShift = {
    id: Date.now(),
    openedAt: new Date().toISOString(),
    modalAwal: amount,
    closedAt: null
  };
  saveData();
  document.getElementById('shift-open-modal').classList.add('hidden');
  updateShiftUI();
  triggerFeedback('success');
  showToast('Shift dibuka! Selamat berjualan');
}

function updateShiftUI() {
  if (!currentShift) return;
  const btn = document.getElementById('shift-status-btn');
  btn.classList.remove('hidden');
  btn.className = 'text-[10px] font-black px-2.5 py-1.5 rounded-full border transition active:scale-95 bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  btn.textContent = '🟢 Shift Aktif';

  const sidebarInfo = document.getElementById('sidebar-shift-info');
  sidebarInfo.classList.remove('hidden');
  document.getElementById('sidebar-modal-awal').textContent = 'Rp ' + currentShift.modalAwal.toLocaleString('id-ID');
  document.getElementById('sidebar-shift-start').textContent = new Date(currentShift.openedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function showShiftCloseModal() {
  if (!currentShift) { showToast('Tidak ada shift aktif'); return; }
  const shiftStart = new Date(currentShift.openedAt);
  const cashSales = allTransactions
    .filter(t => t.payment === 'Cash' && new Date(t.date) >= shiftStart)
    .reduce((sum, t) => sum + t.subtotalOmzet, 0);
  
  const expected = currentShift.modalAwal + cashSales;
  document.getElementById('close-modal-awal').textContent = 'Rp ' + currentShift.modalAwal.toLocaleString('id-ID');
  document.getElementById('close-modal-cash-sales').textContent = 'Rp ' + cashSales.toLocaleString('id-ID');
  document.getElementById('close-modal-expected').textContent = 'Rp ' + expected.toLocaleString('id-ID');
  document.getElementById('close-modal-actual').value = '';
  document.getElementById('shift-diff-panel').classList.add('hidden');
  document.getElementById('shift-close-modal').classList.remove('hidden');
}

function calculateShiftDiff() {
  const actualVal = parseInt(document.getElementById('close-modal-actual').value) || 0;
  const expectedText = document.getElementById('close-modal-expected').textContent.replace(/[^0-9]/g, '');
  const expected = parseInt(expectedText) || 0;
  const diff = actualVal - expected;
  const panel = document.getElementById('shift-diff-panel');
  const diffEl = document.getElementById('shift-diff-value');
  
  panel.classList.remove('hidden');
  if (diff === 0) {
    diffEl.textContent = 'PAS (Rp 0)';
    diffEl.className = 'font-black text-lg text-emerald-400';
  } else if (diff > 0) {
    diffEl.textContent = '+Rp ' + diff.toLocaleString('id-ID') + ' (LEBIH)';
    diffEl.className = 'font-black text-lg text-blue-400';
  } else {
    diffEl.textContent = '-Rp ' + Math.abs(diff).toLocaleString('id-ID') + ' (KURANG)';
    diffEl.className = 'font-black text-lg text-red-400';
  }
}

function closeShiftConfirm() {
  const actualVal = parseInt(document.getElementById('close-modal-actual').value);
  if (isNaN(actualVal)) { alert('Masukkan nominal fisik uang di laci!'); return; }
  
  const expectedText = document.getElementById('close-modal-expected').textContent.replace(/[^0-9]/g, '');
  const expected = parseInt(expectedText) || 0;
  const diff = actualVal - expected;
  const shiftStart = new Date(currentShift.openedAt);
  const cashSales = allTransactions
    .filter(t => t.payment === 'Cash' && new Date(t.date) >= shiftStart)
    .reduce((sum, t) => sum + t.subtotalOmzet, 0);

  const closedShift = {
    ...currentShift,
    closedAt: new Date().toISOString(),
    cashSalesDuringShift: cashSales,
    expectedCash: expected,
    actualCash: actualVal,
    selisih: diff
  };

  allShiftHistory.push(closedShift);
  currentShift = null;
  saveData();

  document.getElementById('shift-close-modal').classList.add('hidden');
  document.getElementById('shift-status-btn').classList.add('hidden');
  document.getElementById('sidebar-shift-info').classList.add('hidden');
  triggerFeedback('success');

  const selisihText = diff === 0 ? 'Kas PAS' : (diff > 0 ? `Lebih Rp ${Math.abs(diff).toLocaleString('id-ID')}` : `Kurang Rp ${Math.abs(diff).toLocaleString('id-ID')}`);
  showToast('Shift ditutup! ' + selisihText);

  setTimeout(() => {
    document.getElementById('shift-modal-amount').value = '';
    document.getElementById('shift-open-modal').classList.remove('hidden');
  }, 1200);
}

// ===== AUDIO FEEDBACK SINGLETON =====
let sharedAudioCtx = null;
function getSharedAudioContext() {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function triggerFeedback(type = 'click') {
  if (navigator.vibrate) navigator.vibrate(25);
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); 
    gain.connect(ctx.destination);
    if (type === 'click') {
      osc.type = 'sine'; osc.frequency.value = 800; gain.gain.value = 0.05;
      osc.start(); osc.stop(ctx.currentTime + 0.04);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.value = 0.12; osc.start(); osc.stop(ctx.currentTime + 0.25);
    }
  } catch(e) {}
}

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  document.getElementById('toast-message').innerText = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function toggleSidebar() {
  triggerFeedback();
  document.getElementById('sidebar').classList.toggle('-translate-x-full');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}

function switchPage(pageId, title, requirePin = false) {
  triggerFeedback();
  if (requirePin) {
    let savedPin = localStorage.getItem('warung_ibu_pin');
    if (!savedPin) {
      const createPin = prompt('🔒 SETUP KEAMANAN PERTAMA KALI:\n\nAnda belum membuat PIN Admin.\nMasukkan 4 angka PIN baru:');
      if (createPin && createPin.trim().length >= 4) {
        adminPin = createPin.trim();
        saveData();
        alert('✅ PIN Admin berhasil disimpan!');
      } else {
        alert('❌ Akses dibatalkan. PIN harus minimal 4 digit!');
        return;
      }
    } else {
      const inputPin = prompt('🔐 Masukkan PIN Admin:');
      if (inputPin !== savedPin) {
        alert('❌ PIN Salah!');
        return;
      }
    }
  }

  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  document.getElementById('page-' + pageId).classList.remove('hidden');
  document.getElementById('page-title').innerText = title;

  if (!document.getElementById('sidebar-overlay').classList.contains('hidden')) {
    toggleSidebar();
  }

  refreshActiveViews();
  if (pageId === 'settings') applyTheme(currentTheme);
}

function changeAdminPinPrompt() {
  triggerFeedback();
  let savedPin = localStorage.getItem('warung_ibu_pin');
  if (savedPin) {
    const curr = prompt('Masukkan PIN Lama Anda:');
    if (curr !== savedPin) { alert('❌ PIN Lama Salah!'); return; }
  }
  const newPin = prompt('Masukkan PIN Baru (Minimal 4 Angka):');
  if (newPin && newPin.trim().length >= 4) {
    adminPin = newPin.trim();
    saveData();
    alert('✅ PIN Admin berhasil diperbarui!');
  } else {
    alert('❌ PIN gagal diperbarui. Minimal 4 angka!');
  }
}

function checkLowStock() {
  const lowItems = allProducts.filter(p => p.stock < 5);
  const badge = document.getElementById('low-stock-badge');
  if (lowItems.length > 0) {
    badge.classList.remove('hidden');
    document.getElementById('low-stock-count').innerText = lowItems.length;
  } else {
    badge.classList.add('hidden');
  }
}

function setDailyTargetPrompt() {
  const val = prompt('Masukkan Target Omzet Hari Ini (Rp):', dailyTarget);
  if (val !== null && !isNaN(parseInt(val))) {
    dailyTarget = parseInt(val);
    saveData();
  }
}

function updateTargetUI() {
  const todayOmzet = allTransactions
    .filter(t => isToday(t.date))
    .reduce((sum, t) => sum + t.subtotalOmzet, 0);
  const percent = Math.min(100, Math.round((todayOmzet / dailyTarget) * 100));
  const progressBar = document.getElementById('target-progress-bar');
  const currentText = document.getElementById('target-current-text');
  const goalText = document.getElementById('target-goal-text');
  if (progressBar) progressBar.style.width = percent + '%';
  if (currentText) currentText.innerText = `Capaian: Rp ${todayOmzet.toLocaleString('id-ID')} (${percent}%)`;
  if (goalText) goalText.innerText = `Target: Rp ${dailyTarget.toLocaleString('id-ID')}`;
}

function filterCategory(cat) {
  triggerFeedback();
  selectedCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const label = btn.innerText.trim();
    const active = (cat === 'All' && label === 'Semua') || label === cat;
    btn.className = active
      ? 'cat-btn px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold transition whitespace-nowrap touch-btn shadow-sm'
      : 'cat-btn cat-inactive border px-3.5 py-2 rounded-xl font-bold transition whitespace-nowrap touch-btn';
  });
  renderKasirProducts();
}

function renderKasirProducts() {
  const searchInput = document.getElementById('kasir-search');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  const grid = document.getElementById('kasir-products-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const filtered = allProducts.filter(p => {
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchQuery = p.name.toLowerCase().includes(query);
    return matchCat && matchQuery;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="col-span-2 text-sub italic text-center py-6">Menu tidak ditemukan.</p>';
    return;
  }

  filtered.forEach(p => {
    const isLow = p.stock < 5;
    const stockBadge = isLow
      ? `<span class="text-red-400 font-bold">⚠️ Stok: ${p.stock}</span>`
      : `<span class="text-sub">Stok: ${p.stock}</span>`;
    
    grid.insertAdjacentHTML('beforeend', `
      <div onclick="addToCart('${p.id}')" class="item-row p-3 border rounded-xl hover:border-amber-500/50 cursor-pointer active:scale-95 transition flex flex-col justify-between touch-btn shadow-sm">
        <div>
          <p class="font-bold text-main line-clamp-1">${p.name}</p>
          <p class="text-accent font-black text-xs mt-0.5">Rp ${p.price.toLocaleString('id-ID')}</p>
        </div>
        <div class="mt-2 text-[10px] flex justify-between items-center">
          ${stockBadge}
          <span class="bg-amber-500/20 text-accent border border-amber-500/30 px-2 py-0.5 rounded font-bold">+ Tambah</span>
        </div>
      </div>
    `);
  });
}

function addCustomItemPrompt() {
  triggerFeedback();
  const name = prompt('Nama Barang Dadakan (Cth: Kerupuk/Gorengan):');
  if (!name || !name.trim()) return;
  const price = parseInt(prompt('Harga Jual (Rp):'));
  if (!price || isNaN(price) || price <= 0) return;
  cart.push({
    productId: 'custom_' + Date.now(),
    name: '✨ ' + name.trim(),
    price: price,
    cogs: Math.round(price * 0.6),
    qty: 1,
    isCustom: true
  });
  renderCartUI();
  showToast('Item custom ditambahkan');
}

function addToCart(productId) {
  triggerFeedback('click');
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  const cartItem = cart.find(c => c.productId === productId);
  const qtyInCart = cartItem ? cartItem.qty : 0;
  if (product.stock <= qtyInCart) {
    alert(`Stok ${product.name} tidak mencukupi! Sisa: ${product.stock}`);
    return;
  }
  if (cartItem) {
    cartItem.qty += 1;
  } else {
    cart.push({ productId: product.id, name: product.name, price: product.price, cogs: product.cogs || 0, qty: 1 });
  }
  renderCartUI();
}

function updateCartQty(productId, change) {
  triggerFeedback('click');
  const cartItem = cart.find(c => c.productId === productId);
  if (!cartItem) return;
  if (!cartItem.isCustom) {
    const product = allProducts.find(p => p.id === productId);
    if (change > 0 && product.stock <= cartItem.qty) {
      alert(`Stok ${product.name} sisa ${product.stock}`);
      return;
    }
  }
  cartItem.qty += change;
  if (cartItem.qty <= 0) {
    cart = cart.filter(c => c.productId !== productId);
  }
  renderCartUI();
}

function clearCart() {
  triggerFeedback();
  cart = [];
  givenCashAmount = 0;
  const customCash = document.getElementById('custom-cash-input');
  if (customCash) customCash.value = '';
  renderCartUI();
}

function calculateCartFinalTotal() {
  return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function setCashAmount(val) {
  triggerFeedback();
  const finalTotal = calculateCartFinalTotal();
  givenCashAmount = val === 'pas' ? finalTotal : val;
  const customCash = document.getElementById('custom-cash-input');
  if (customCash) customCash.value = givenCashAmount || '';
  calculateChange();
}

function onCustomCashInput() {
  const customCash = document.getElementById('custom-cash-input');
  const v = customCash ? parseInt(customCash.value) : NaN;
  givenCashAmount = !isNaN(v) ? v : 0;
  calculateChange();
}

function calculateChange() {
  const finalTotal = calculateCartFinalTotal();
  const change = givenCashAmount - finalTotal;
  const el = document.getElementById('change-amount-text');
  if (!el) return;
  if (givenCashAmount === 0 || cart.length === 0) {
    el.innerText = 'Rp 0'; el.className = 'text-lg font-black text-sub';
  } else if (change < 0) {
    el.innerText = `Kurang Rp ${Math.abs(change).toLocaleString('id-ID')}`; el.className = 'text-lg font-black text-red-400';
  } else {
    el.innerText = `Rp ${change.toLocaleString('id-ID')}`; el.className = 'text-lg font-black text-emerald-400';
  }
}

function renderCartUI() {
  const list = document.getElementById('cart-items-list');
  const totalAmountEl = document.getElementById('cart-total-amount');
  if (!list || !totalAmountEl) return;
  const finalTotal = calculateCartFinalTotal();
  if (cart.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-4">Klik menu di atas untuk menambah pesanan.</p>';
    totalAmountEl.innerText = 'Rp 0';
    calculateChange();
    return;
  }
  list.innerHTML = '';
  cart.forEach(c => {
    const sub = c.price * c.qty;
    list.insertAdjacentHTML('beforeend', `
      <div class="flex justify-between items-center item-row p-2.5 rounded-xl border">
        <div>
          <p class="font-bold text-main">${c.name}</p>
          <p class="text-[10px] text-sub">Rp ${c.price.toLocaleString('id-ID')} x ${c.qty}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-accent text-xs">Rp ${sub.toLocaleString('id-ID')}</span>
          <div class="flex items-center card-bg rounded-lg text-xs border section-divider">
            <button onclick="updateCartQty('${c.productId}', -1)" class="px-2.5 py-1 text-sub font-bold hover:text-main touch-btn">-</button>
            <span class="px-1 font-bold text-accent text-[11px]">${c.qty}</span>
            <button onclick="updateCartQty('${c.productId}', 1)" class="px-2.5 py-1 text-sub font-bold hover:text-main touch-btn">+</button>
          </div>
        </div>
      </div>
    `);
  });
  totalAmountEl.innerText = 'Rp ' + finalTotal.toLocaleString('id-ID');
  calculateChange();
}

function handlePaymentMethodChange() {
  triggerFeedback();
  const methodEl = document.getElementById('cart-payment-method');
  const method = methodEl ? methodEl.value : 'Cash';
  const cashSection = document.getElementById('cash-helper-section');
  if (cashSection) cashSection.classList.toggle('hidden', method === 'Kasbon' || method === 'QRIS');
  if (method === 'QRIS') {
    givenCashAmount = calculateCartFinalTotal();
  }
}

function checkoutCart() {
  if (!currentShift) {
    alert('Buka Shift terlebih dahulu sebelum melakukan transaksi!');
    document.getElementById('shift-open-modal').classList.remove('hidden');
    return;
  }
  if (cart.length === 0) { alert('Belum ada pesanan di keranjang!'); return; }
  const methodEl = document.getElementById('cart-payment-method');
  const customerInput = document.getElementById('cart-customer-name');
  const payment = methodEl ? methodEl.value : 'Cash';
  const customerName = customerInput ? customerInput.value.trim() : '';
  if (payment === 'Kasbon' && !customerName) { alert('Isi nama pembeli untuk mencatat kasbon!'); return; }

  const finalTotal = calculateCartFinalTotal();
  let totalProfit = 0;

  cart.forEach(c => {
    if (!c.isCustom) {
      const prod = allProducts.find(p => p.id === c.productId);
      if (prod) prod.stock -= c.qty;
    }
    totalProfit += (c.price - c.cogs) * c.qty;
  });

  const changeVal = (payment === 'Cash' && givenCashAmount > finalTotal) ? (givenCashAmount - finalTotal) : 0;

  const newTx = {
    id: Date.now(),
    date: new Date().toISOString(),
    items: [...cart],
    rawTotal: finalTotal,
    discount: 0,
    payment,
    customerName: customerName || 'Umum',
    cashGiven: payment === 'Cash' ? (givenCashAmount || finalTotal) : finalTotal,
    changeAmount: changeVal,
    isPaid: payment !== 'Kasbon',
    subtotalOmzet: finalTotal,
    subtotalProfit: totalProfit
  };

  allTransactions.push(newTx);

  saveData();
  triggerFeedback('success');
  showToast('Transaksi Sukses Tercatat!');

  // Reset Form
  cart = [];
  givenCashAmount = 0;
  if (customerInput) customerInput.value = '';
  const customCash = document.getElementById('custom-cash-input');
  if (customCash) customCash.value = '';
  if (methodEl) methodEl.value = 'Cash';
  const cashSection = document.getElementById('cash-helper-section');
  if (cashSection) cashSection.classList.remove('hidden');
  
  renderKasirProducts();
  renderCartUI();
  renderKasirPage();
  updateTargetUI();

  // Tampilkan Modal Struk Belanja
  showReceiptModal(newTx);
}

function showReceiptModal(tx) {
  activeReceiptTx = tx;
  document.getElementById('receipt-date').innerText = new Date(tx.date).toLocaleString('id-ID');
  document.getElementById('receipt-customer').innerText = tx.customerName;
  document.getElementById('receipt-payment').innerText = tx.payment;
  document.getElementById('receipt-total').innerText = 'Rp ' + tx.subtotalOmzet.toLocaleString('id-ID');
  document.getElementById('receipt-cash').innerText = 'Rp ' + tx.cashGiven.toLocaleString('id-ID');
  document.getElementById('receipt-change').innerText = 'Rp ' + tx.changeAmount.toLocaleString('id-ID');

  const itemsContainer = document.getElementById('receipt-items-list');
  itemsContainer.innerHTML = '';
  tx.items.forEach(i => {
    itemsContainer.insertAdjacentHTML('beforeend', `
      <div class="flex justify-between">
        <span>${i.qty}x ${i.name}</span>
        <span>Rp ${(i.price * i.qty).toLocaleString('id-ID')}</span>
      </div>
    `);
  });

  document.getElementById('receipt-modal').classList.remove('hidden');
}

function shareReceiptWA() {
  if (!activeReceiptTx) return;
  const tx = activeReceiptTx;
  let text = `*--- STRUK WARUNG IBU ---*\n`;
  text += `Tanggal: ${new Date(tx.date).toLocaleString('id-ID')}\n`;
  text += `Pelanggan: ${tx.customerName}\n`;
  text += `Metode: ${tx.payment}\n`;
  text += `-------------------------\n`;
  tx.items.forEach(i => {
    text += `${i.qty}x ${i.name} = Rp ${(i.price * i.qty).toLocaleString('id-ID')}\n`;
  });
  text += `-------------------------\n`;
  text += `*TOTAL: Rp ${tx.subtotalOmzet.toLocaleString('id-ID')}*\n`;
  text += `Bayar: Rp ${tx.cashGiven.toLocaleString('id-ID')}\n`;
  text += `Kembali: Rp ${tx.changeAmount.toLocaleString('id-ID')}\n\n`;
  text += `Terima Kasih Telah Berbelanja! 🙏`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function renderKasirPage() {
  const todayTxs = allTransactions.filter(t => isToday(t.date));
  const list = document.getElementById('transaction-list');
  if (!list) return;
  if (todayTxs.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-4">Belum ada penjualan hari ini.</p>';
    return;
  }
  list.innerHTML = '';
  todayTxs.slice().reverse().forEach(t => {
    const time = new Date(t.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    let badgeColor = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    if (t.payment === 'QRIS') badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    if (t.payment === 'Kasbon') badgeColor = t.isPaid ? 'bg-slate-700/30 text-sub' : 'bg-red-500/20 text-red-400 border border-red-500/30';

    const summary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');
    list.insertAdjacentHTML('beforeend', `
      <div class="flex justify-between items-center p-3 item-row rounded-xl border shadow-sm">
        <div onclick="showReceiptModal(allTransactions.find(x => x.id === ${t.id}))" class="cursor-pointer flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-main text-xs">${summary}</span>
            <span class="text-[9px] px-2 py-0.5 rounded font-bold ${badgeColor}">${t.payment}${t.customerName !== 'Umum' ? ` (${t.customerName})` : ''}</span>
          </div>
          <p class="text-[10px] text-sub mt-0.5">${time} WIB • <span class="text-accent underline">Lihat Struk</span></p>
        </div>
        <div class="flex items-center gap-2 ml-2">
          <p class="font-bold text-accent text-xs">Rp ${t.subtotalOmzet.toLocaleString('id-ID')}</p>
          <button onclick="deleteTransaction(${t.id})" class="text-sub hover:text-red-400 font-bold p-1 touch-btn text-base" title="Batalkan Transaksi">🗑️</button>
        </div>
      </div>
    `);
  });
}

function deleteTransaction(id) {
  if (confirm('Batalkan transaksi ini? Stok akan dikembalikan & catatan dipindahkan ke Audit Log.')) {
    triggerFeedback();
    const txIndex = allTransactions.findIndex(t => t.id === id);
    if (txIndex !== -1) {
      const tx = allTransactions[txIndex];
      tx.items.forEach(item => {
        if (!item.isCustom) {
          const product = allProducts.find(p => p.id === item.productId);
          if (product) product.stock += item.qty;
        }
      });
      tx.deletedAt = new Date().toISOString();
      allDeletedTransactions.push(tx);
      allTransactions.splice(txIndex, 1);
      saveData();
      renderKasirPage();
      renderKasirProducts();
      showToast('Transaksi dipindahkan ke Audit Log');
    }
  }
}

function renderDeletedPage() {
  const list = document.getElementById('deleted-list');
  const deletedTotalText = document.getElementById('deleted-total-text');
  if (!list) return;
  let totalDeleted = 0;
  if (allDeletedTransactions.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-6">Bersih! Belum ada riwayat transaksi yang dihapus.</p>';
    if (deletedTotalText) deletedTotalText.innerText = 'Rp 0';
    return;
  }
  list.innerHTML = '';
  allDeletedTransactions.slice().reverse().forEach(t => {
    totalDeleted += t.subtotalOmzet;
    const txTime = new Date(t.date).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    const delTime = new Date(t.deletedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    const summary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');

    list.insertAdjacentHTML('beforeend', `
      <div class="p-3 bg-red-950/20 border border-red-900/40 rounded-xl space-y-1">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-bold text-main text-xs">${summary}</p>
            <p class="text-[10px] text-sub">Pembeli: <span class="text-accent font-bold">${t.customerName}</span> (${t.payment})</p>
          </div>
          <span class="font-black text-red-400 text-xs">-Rp ${t.subtotalOmzet.toLocaleString('id-ID')}</span>
        </div>
        <div class="border-t border-red-900/30 pt-1 flex justify-between items-center text-[9px] text-sub">
          <span>Transaksi: ${txTime}</span>
          <span class="text-red-400 font-bold">Dihapus: ${delTime}</span>
        </div>
      </div>
    `);
  });
  if (deletedTotalText) deletedTotalText.innerText = 'Rp ' + totalDeleted.toLocaleString('id-ID');
}

function renderKasbonPage() {
  const unpaid = allTransactions.filter(t => t.payment === 'Kasbon' && !t.isPaid);
  const list = document.getElementById('kasbon-list');
  const totalUnpaidDebt = document.getElementById('total-unpaid-debt');
  if (!list) return;
  let totalDebt = 0;
  if (unpaid.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-4">Semua utang kasbon lunas! Hebat 🎉</p>';
    if (totalUnpaidDebt) totalUnpaidDebt.innerText = 'Rp 0';
    return;
  }
  list.innerHTML = '';
  unpaid.forEach(t => {
    totalDebt += t.subtotalOmzet;
    const dateStr = new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const summary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');

    list.insertAdjacentHTML('beforeend', `
      <div class="p-3 bg-red-950/30 border border-red-800/40 rounded-xl flex justify-between items-center shadow-sm">
        <div>
          <p class="font-bold text-main text-sm">${t.customerName}</p>
          <p class="text-[10px] text-sub">${summary} (${dateStr})</p>
          <p class="font-extrabold text-red-400 text-xs mt-0.5">Rp ${t.subtotalOmzet.toLocaleString('id-ID')}</p>
        </div>
        <div class="flex gap-1.5">
          <button onclick="tagihWA(${t.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-2 rounded-lg text-[10px] touch-btn active:scale-95 shadow-sm">Tagih WA</button>
          <button onclick="payDebt(${t.id})" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-2 rounded-lg text-[10px] touch-btn active:scale-95 shadow-sm">Lunas</button>
        </div>
      </div>
    `);
  });
  if (totalUnpaidDebt) totalUnpaidDebt.innerText = 'Rp ' + totalDebt.toLocaleString('id-ID');
}

function payDebt(id) {
  triggerFeedback('success');
  const tx = allTransactions.find(t => t.id === id);
  if (tx) {
    tx.isPaid = true;
    saveData();
    showToast('Kasbon berhasil dilunasi!');
  }
}

function tagihWA(id) {
  triggerFeedback();
  const tx = allTransactions.find(t => t.id === id);
  if (!tx) return;
  const text = `Halo Kak *${tx.customerName}*, sekadar mengingatkan catatan kasbon di Warung Ibu sebesar *Rp ${tx.subtotalOmzet.toLocaleString('id-ID')}*. Jika ada kelonggaran rezeki, boleh dibantu pelunasannya ya Kak. Terima kasih banyak! 🙏`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function addProduct() {
  triggerFeedback();
  const nameEl = document.getElementById('new-prod-name');
  const catEl = document.getElementById('new-prod-cat');
  const priceEl = document.getElementById('new-prod-price');
  const cogsEl = document.getElementById('new-prod-cogs');
  const stockEl = document.getElementById('new-prod-stock');

  const name = nameEl ? nameEl.value.trim() : '';
  const category = catEl ? catEl.value : 'Makanan';
  const price = priceEl ? (parseInt(priceEl.value) || 0) : 0;
  const cogs = cogsEl ? (parseInt(cogsEl.value) || 0) : 0;
  const stock = stockEl ? (parseInt(stockEl.value) || 0) : 0;

  if (!name || price <= 0) {
    alert('Mohon isi nama dan harga jual produk dengan benar!');
    return;
  }

  allProducts.push({
    id: 'p_' + Date.now(),
    name,
    category,
    price,
    cogs,
    stock
  });
  saveData();

  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  if (cogsEl) cogsEl.value = '';
  if (stockEl) stockEl.value = '';
  showToast('Produk baru berhasil ditambahkan!');
}

function openEditProductModal(id) {
  triggerFeedback();
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('edit-prod-id').value = p.id;
  document.getElementById('edit-prod-name').value = p.name;
  document.getElementById('edit-prod-cat').value = p.category || 'Makanan';
  document.getElementById('edit-prod-price').value = p.price;
  document.getElementById('edit-prod-cogs').value = p.cogs || 0;
  document.getElementById('edit-prod-stock').value = p.stock;
  document.getElementById('edit-product-modal').classList.remove('hidden');
}

function saveProductEdit() {
  const id = document.getElementById('edit-prod-id').value;
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  p.name = document.getElementById('edit-prod-name').value.trim() || p.name;
  p.category = document.getElementById('edit-prod-cat').value;
  p.price = parseInt(document.getElementById('edit-prod-price').value) || p.price;
  p.cogs = parseInt(document.getElementById('edit-prod-cogs').value) || 0;
  p.stock = parseInt(document.getElementById('edit-prod-stock').value) || 0;

  saveData();
  document.getElementById('edit-product-modal').classList.add('hidden');
  showToast('Data produk berhasil diperbarui!');
}

function deleteProduct(id) {
  const prod = allProducts.find(p => p.id === id);
  if (!prod) return;
  if (confirm(`Hapus produk "${prod.name}" dari daftar stok? Riwayat transaksi lampau akan tetap aman.`)) {
    triggerFeedback();
    allProducts = allProducts.filter(p => p.id !== id);
    saveData();
    showToast('Produk berhasil dihapus');
  }
}

function renderProductsPage() {
  const list = document.getElementById('products-list');
  const stockSearch = document.getElementById('stock-search');
  const query = stockSearch ? stockSearch.value.toLowerCase() : '';
  if (!list) return;
  list.innerHTML = '';

  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-6">Produk tidak ditemukan.</p>';
    return;
  }
  filtered.forEach(p => {
    const isLow = p.stock < 5;
    const stockBadge = isLow
      ? `<span class="bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded text-[9px]">⚠️ Stok Tipis (${p.stock})</span>`
      : `<span class="text-sub font-semibold text-[10px]">Stok: ${p.stock} pcs</span>`;

    list.insertAdjacentHTML('beforeend', `
      <div class="p-3 item-row rounded-xl flex justify-between items-center border shadow-sm">
        <div>
          <p class="font-bold text-main text-xs">${p.name} <span class="text-[10px] text-sub font-normal">(${p.category || 'Makanan'})</span></p>
          <p class="text-sub text-[10px]">Harga Jual: Rp ${p.price.toLocaleString('id-ID')} | HPP: Rp ${p.cogs.toLocaleString('id-ID')}</p>
          <div class="mt-1">${stockBadge}</div>
        </div>
        <div class="flex gap-2 items-center">
          <button onclick="openEditProductModal('${p.id}')" class="bg-amber-500/20 text-accent border border-amber-500/30 px-2.5 py-2 rounded-lg font-bold text-[10px] touch-btn active:scale-95">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="text-sub hover:text-red-400 font-bold p-1.5 touch-btn text-base" title="Hapus Produk">🗑️</button>
        </div>
      </div>
    `);
  });
}

function addExpense() {
  triggerFeedback();
  const catEl = document.getElementById('exp-category');
  const amountEl = document.getElementById('exp-amount');
  const noteEl = document.getElementById('exp-note');

  const category = catEl ? catEl.value : 'Lain-lain';
  const amount = amountEl ? (parseInt(amountEl.value) || 0) : 0;
  const note = noteEl ? noteEl.value.trim() : '';

  if (amount <= 0) { alert('Masukkan nominal pengeluaran yang valid!'); return; }

  allExpenses.push({
    id: Date.now(),
    date: new Date().toISOString(),
    category,
    amount,
    note
  });
  saveData();
  if (amountEl) amountEl.value = '';
  if (noteEl) noteEl.value = '';
  showToast('Pengeluaran berhasil dicatat!');
}

function deleteExpense(id) {
  if (confirm('Hapus catatan pengeluaran ini?')) {
    triggerFeedback();
    allExpenses = allExpenses.filter(e => e.id !== id);
    saveData();
    showToast('Pengeluaran dihapus');
  }
}

function renderExpensesList() {
  const todayExp = allExpenses.filter(e => isToday(e.date));
  const list = document.getElementById('expenses-list');
  if (!list) return;
  if (todayExp.length === 0) {
    list.innerHTML = '<p class="text-sub italic text-center py-4">Belum ada pengeluaran hari ini.</p>';
    return;
  }
  list.innerHTML = '';
  todayExp.slice().reverse().forEach(e => {
    const time = new Date(e.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    list.insertAdjacentHTML('beforeend', `
      <div class="flex justify-between items-center p-3 bg-red-950/20 rounded-xl border border-red-900/30 shadow-sm">
        <div>
          <p class="font-bold text-main text-xs">${e.category}</p>
          <p class="text-[10px] text-sub">${e.note ? e.note + ' • ' : ''}${time} WIB</p>
        </div>
        <div class="flex items-center gap-2">
          <p class="font-bold text-red-400 text-xs">-Rp ${e.amount.toLocaleString('id-ID')}</p>
          <button onclick="deleteExpense(${e.id})" class="text-sub hover:text-red-400 font-bold p-1 touch-btn text-base" title="Hapus">🗑️</button>
        </div>
      </div>
    `);
  });
}

function setReportPeriod(period) {
  triggerFeedback();
  currentReportPeriod = period;
  ['daily', 'weekly', 'monthly'].forEach(p => {
    const btn = document.getElementById('tab-' + p);
    if (btn) {
      btn.className = p === period
        ? 'flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold transition text-center shadow'
        : 'flex-1 py-3 rounded-xl text-sub transition text-center hover:text-main';
    }
  });
  updateReportUI();
}

function updateReportUI() {
  const now = new Date();
  let filteredTxs = [], filteredExp = [];
  const reportPeriodTitle = document.getElementById('report-period-title');
  if (currentReportPeriod === 'daily') {
    if (reportPeriodTitle) reportPeriodTitle.innerText = 'Laporan Hari Ini';
    filteredTxs = allTransactions.filter(t => isToday(t.date));
    filteredExp = allExpenses.filter(e => isToday(e.date));
  } else if (currentReportPeriod === 'weekly') {
    if (reportPeriodTitle) reportPeriodTitle.innerText = 'Laporan 7 Hari Terakhir';
    const ago = new Date(); ago.setDate(now.getDate() - 7);
    filteredTxs = allTransactions.filter(t => new Date(t.date) >= ago);
    filteredExp = allExpenses.filter(e => new Date(e.date) >= ago);
  } else {
    if (reportPeriodTitle) reportPeriodTitle.innerText = 'Laporan Bulan Ini';
    filteredTxs = allTransactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    filteredExp = allExpenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  let omzet = 0, grossProfit = 0, totalQty = 0, cash = 0, qris = 0, kasbon = 0;
  const salesMap = {};
  filteredTxs.forEach(t => {
    omzet += t.subtotalOmzet;
    grossProfit += t.subtotalProfit;
    if (t.payment === 'Cash') cash += t.subtotalOmzet;
    if (t.payment === 'QRIS') qris += t.subtotalOmzet;
    if (t.payment === 'Kasbon' && !t.isPaid) kasbon += t.subtotalOmzet;
    t.items.forEach(i => {
      totalQty += i.qty;
      salesMap[i.name] = (salesMap[i.name] || 0) + i.qty;
    });
  });

  let totalExpenses = filteredExp.reduce((s, e) => s + e.amount, 0);
  let netProfit = grossProfit - totalExpenses;

  const setElText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setElText('report-omzet', 'Rp ' + omzet.toLocaleString('id-ID'));
  setElText('report-gross-profit', 'Rp ' + grossProfit.toLocaleString('id-ID'));
  setElText('report-expense-total', '-Rp ' + totalExpenses.toLocaleString('id-ID'));
  setElText('report-net-profit', 'Rp ' + netProfit.toLocaleString('id-ID'));
  setElText('report-qty', totalQty + ' pcs');
  setElText('report-cash', 'Rp ' + cash.toLocaleString('id-ID'));
  setElText('report-qris', 'Rp ' + qris.toLocaleString('id-ID'));
  setElText('report-kasbon', 'Rp ' + kasbon.toLocaleString('id-ID'));

  const topProducts = Object.entries(salesMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topListEl = document.getElementById('top-products-list');
  if (topListEl) {
    topListEl.innerHTML = '';
    if (topProducts.length === 0) {
      topListEl.innerHTML = '<p class="text-sub italic text-[11px]">Belum ada data penjualan pada periode ini.</p>';
    } else {
      topProducts.forEach(([name, count], i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉');
        topListEl.insertAdjacentHTML('beforeend', `
          <div class="flex justify-between items-center section-divider border-b pb-1.5">
            <span class="text-main">${medal} ${name}</span>
            <span class="font-extrabold text-accent">${count} pcs</span>
          </div>
        `);
      });
    }
  }

  renderChart(omzet, netProfit, totalExpenses);
}

function renderChart(omzet, profit, expense) {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Omzet', 'Laba Bersih', 'Pengeluaran'],
      datasets: [{
        data: [omzet, profit, expense],
        backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: currentTheme === 'dark' ? '#94a3b8' : '#475569', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: currentTheme === 'dark' ? '#94a3b8' : '#475569', font: { size: 10 } }, grid: { color: currentTheme === 'dark' ? '#334155' : '#e2e8f0' } }
      }
    }
  });
}

function exportExcel() {
  const now = new Date();
  const timeString = now.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
      .header-title { font-size: 18px; font-weight: bold; color: #d97706; margin-bottom: 5px; }
      table { border-collapse: collapse; width: 100%; margin-top: 10px; margin-bottom: 20px; }
      th { background-color: #f59e0b; color: #fff; border: 1px solid #d97706; padding: 8px; font-size: 11px; text-align: left; }
      td { border: 1px solid #cbd5e1; padding: 8px; font-size: 11px; }
      .text-right { text-align: right; }
    </style></head>
    <body>
      <div class="header-title">🏪 LAPORAN KEUANGAN - WARUNG IBU PRO</div>
      <div>Waktu Export: ${timeString}</div>
      <h3>Riwayat Transaksi Penjualan</h3>
      <table>
        <thead><tr><th>Waktu</th><th>Pelanggan</th><th>Produk</th><th>Metode</th><th>Status</th><th class="text-right">Omzet</th><th class="text-right">Laba</th></tr></thead>
        <tbody>
  `;
  if (allTransactions.length === 0) {
    html += `<tr><td colspan="7" style="text-align: center;">Belum ada data.</td></tr>`;
  } else {
    allTransactions.slice().reverse().forEach(t => {
      const txDate = new Date(t.date).toLocaleString('id-ID');
      const productSummary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');
      html += `<tr><td>${txDate}</td><td>${t.customerName}</td><td>${productSummary}</td><td>${t.payment}</td><td>${t.isPaid ? 'Lunas' : 'Kasbon'}</td><td class="text-right">Rp ${t.subtotalOmzet.toLocaleString('id-ID')}</td><td class="text-right">Rp ${t.subtotalProfit.toLocaleString('id-ID')}</td></tr>`;
    });
  }
  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_Keuangan_Warung_Ibu_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
}

function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
    products: allProducts,
    transactions: allTransactions,
    deletedTransactions: allDeletedTransactions,
    expenses: allExpenses,
    shifts: allShiftHistory,
    target: dailyTarget,
    pin: adminPin
  }));
  const a = document.getElementById('a');
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `backup_warung_ibu_${new Date().toISOString().slice(0, 10)}.json`);
  downloadAnchor.click();
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.products && imported.transactions) {
        allProducts = imported.products;
        allTransactions = imported.transactions;
        if (imported.deletedTransactions) allDeletedTransactions = imported.deletedTransactions;
        if (imported.expenses) allExpenses = imported.expenses;
        if (imported.shifts) allShiftHistory = imported.shifts;
        if (imported.target) dailyTarget = imported.target;
        if (imported.pin) adminPin = imported.pin;
        saveData();
        alert('✅ Data berhasil dipulihkan!');
        location.reload();
      } else { alert('❌ Format file tidak valid!'); }
    } catch(err) { alert('❌ Gagal membaca file JSON!'); }
  };
  reader.readAsText(file);
}

// Inisialisasi awal saat script dimuat
checkLowStock();
renderKasirProducts();
renderCartUI();
renderKasirPage();
updateTargetUI();
checkShiftOnLoad();