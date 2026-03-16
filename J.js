firebase.initializeApp({
apiKey: "AIzaSyDodYMJK-05UhWw1io4b-WYkn1mpWmZrVY",
authDomain: "fourm-497aa.firebaseapp.com",
projectId: "fourm-497aa",
storageBucket: "fourm-497aa.firebasestorage.app",
messagingSenderId: "188261891425",
appId: "1:188261891425:web:b9cbfd0fea5d0bbeeed920"
});
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();
// ════════════════════════════════════════════════════
// ADMIN UID — set this to your Firebase UID
const ADMIN_UID = "fenJvZ3YoVUAL7kXKbTsdiUmom22";
// ════════════════════════════════════════════════════
const BOOTSTRAP_ADMIN = ADMIN_UID;
const isAdminUID = uid => uid === ADMIN_UID;
const isBootstrap = uid => uid === BOOTSTRAP_ADMIN;
// Ranks that use built-in styling (not custom purple)
const SYSTEM_RANKS = ["Admin", "User", "Banned", "Deactivated", ""];
// Global state
let me = null;
let allUsers = {};
let allPosts = [];
window.postMedia = [];
let usersReady = false;
let postsReady = false;
let currentProfileUid = null;
let currentFeedTab = 'all';
const expandedPosts = new Set();
let lastPostTime = 0; // Stores the timestamp of the last successful post
let postMedia = []; // Now an array: [{ file, type, url, mimeType }, ...]
// If any unexpected error occurs, show a friendly message instead of leaving the feed stuck on "Loading..."
window.onerror = (message, source, lineno, colno, error) => {
console.error('Unhandled JS error:', message, source, lineno, colno, error);
const feed = document.getElementById('main-feed');
if (feed) {
feed.innerHTML = `<p id="feed-empty">Something went wrong loading the feed. Check the console for details.</p>`;
}
return false; // allow default handler too
};
// ── Helpers ──────────────────────────────────────────────────────────
function fileToBase64(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = () => resolve(reader.result);
reader.onerror = reject;
reader.readAsDataURL(file); // This gives 'data:type;base64,...'
});
}
function rankBadgeClass(rank) {
if (rank === "Admin") return "badge-admin";
if (rank === "Banned" || rank === "Deactivated") return "badge-banned";
if (!rank || rank === "User") return "badge-rank";
return "badge-custom"; // any custom rank gets purple
}
// ── Modal system ─────────────────────────────────────────────────────
window.openModal = id => {
document.getElementById(id).style.display = 'block';
document.getElementById('overlay').style.display = 'block';
};
window.closeModal = id => {
document.getElementById(id).style.display = 'none';
const anyOpen = [...document.querySelectorAll('.modal')]
.some(m => m.style.display === 'block');
if (!anyOpen) document.getElementById('overlay').style.display = 'none';
};
window.closeAll = () => {
document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
document.getElementById('overlay').style.display = 'none';
currentProfileUid = null;
};
// Sub-modals (Change Password, Change Email, Deactivate):
// Hides the settings panel and shows a dedicated blurred backdrop.
function openSubModal(id) {
document.getElementById('settings-modal').style.display = 'none';
let bd = document.getElementById('sub-bd');
if (!bd) {
bd = document.createElement('div');
bd.id = 'sub-bd';
bd.style.cssText = [
'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
'z-index:1090'
].join(';');
bd.onclick = () => closeSubModal(id);
document.body.appendChild(bd);
}
bd.style.display = 'block';
document.getElementById(id).style.display = 'block';
}
function closeSubModal(id) {
document.getElementById(id).style.display = 'none';
const bd = document.getElementById('sub-bd');
if (bd) bd.style.display = 'none';
document.getElementById('settings-modal').style.display = 'block';
}
// ── Auth error messages ───────────────────────────────────────────────
function friendlyAuthError(code) {
const map = {
"auth/wrong-password": "Incorrect password.",
"auth/invalid-credential": "Incorrect email or password.",
"auth/user-not-found": "No account with that email.",
"auth/email-already-in-use": "An account with this email already exists.",
"auth/weak-password": "Password must be at least 6 characters.",
"auth/invalid-email": "Please enter a valid email address.",
"auth/too-many-requests": "Too many attempts. Please wait and try again.",
"auth/network-request-failed": "Network error. Check your connection.",
"auth/requires-recent-login": "Please log out and log back in first.",
};
return map[code] || "Unknown error.";
}
function showMsg(id, text, type = "error") {
const el = document.getElementById(id);
if (!el) return;
el.textContent = text;
el.className = `msg msg-${type} show`;
}
function clearMsg(id) {
const el = document.getElementById(id);
if (!el) return;
el.className = "msg msg-error";
el.textContent = "";
}
// ── Avatar rendering ─────────────────────────────────────────────────
function renderAvatarEl(el, user) {
if (!el) return;
if (user && user.photoURL) {
el.innerHTML = `<img src="${user.photoURL}" alt="">`;
} else {
el.innerHTML = "";
el.textContent = (user?.displayName || "?")[0].toUpperCase();
}
}
function makeSmallAvatar(user) {
const div = document.createElement('div');
div.className = "follower-avatar";
if (user && user.photoURL) {
div.innerHTML = `<img src="${user.photoURL}" alt="">`;
} else {
div.textContent = (user?.displayName || "?")[0].toUpperCase();
}
return div;
}
// ── Account age formatting ────────────────────────────────────────────
function formatAccountAge(createdAt) {
if (!createdAt) return "Unknown";
const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
const diff = Math.floor((new Date() - date) / 1000);
if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} old`;
if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} old`;
if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} old`;
if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} old`;
if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} month${Math.floor(diff / (86400 * 30)) !== 1 ? 's' : ''} old`;
return `${Math.floor(diff / (86400 * 365))} year${Math.floor(diff / (86400 * 365)) !== 1 ? 's' : ''} old`;
}
function accountOlderThan(createdAt, seconds) {
if (!createdAt) return false;
const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
return (new Date() - date) / 1000 > seconds;
}
// ── Profanity filter ─────────────────────────────────────────────────
// Strips ALL non-letter characters before checking, so "n.i.g.g.e.r" etc. are caught.
const HARD_BLOCKED_WORDS = [
"nigger", "nigga", "kike", "spic", "chink", "wetback",
"faggot", "tranny", "nonce", "cock", "Rape", "Pussy",
"rapist", "nazi", "hitler"
];
function containsProfanity(text) {
const stripped = text.toLowerCase().replace(/[^a-z]/g, '');
return HARD_BLOCKED_WORDS.some(w => stripped.includes(w.replace(/[^a-z]/g, '')));
}
// ── Post media handling ──────────────────────────────────────────────
function renderMediaPreviews() {
    const preview = document.getElementById('post-media-preview');
    if (!preview) return;

    preview.innerHTML = '';
    
    if (postMedia.length > 0) {
        preview.style.display = 'flex'; 
        preview.style.flexWrap = 'wrap';
        preview.style.gap = '10px';
        preview.style.marginBottom = "15px";
    } else {
        preview.style.display = 'none';
    }

    postMedia.forEach((media, index) => {
        const container = document.createElement('div');
        container.style.cssText = "position:relative; display:inline-block; width:70px; height:70px;";
        
        const el = document.createElement(media.type === 'image' ? 'img' : 'video');
        el.src = media.url;
        el.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid var(--primary);";
        
        const btn = document.createElement('button');
        btn.type = "button"; 
        btn.innerHTML = "&times;";
        
        // Style with !important to force the look
        btn.className = "remove-media-btn";

        // The logic
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            postMedia.splice(index, 1);
            renderMediaPreviews();
        };

        container.appendChild(el);
        container.appendChild(btn);
        preview.appendChild(container);
    });

    const removeAllBtn = document.getElementById('remove-media-btn');
    if (removeAllBtn) removeAllBtn.style.display = postMedia.length > 0 ? 'inline-block' : 'none';
}

// THIS FUNCTION MUST BE ACCESSIBLE GLOBALLY
window.removeMediaByIndex = function(index) {
    console.log("Removing media at index:", index);
    if (postMedia && postMedia[index]) {
        postMedia.splice(index, 1);
        renderMediaPreviews();
    }
};

// Create a TRULY global removal function
window.removeSpecificMedia = function(index) {
    console.log("Nuclear removal triggered for index:", index);
    window.postMedia.splice(index, 1);
    renderMediaPreviews();
};
window.handlePostMedia = input => {
    const files = Array.from(input.files);
    if (postMedia.length + files.length > 4) {
        alert('Max 4 images.');
        return;
    }

    files.forEach(file => {
        const type = file.type.startsWith('image/') ? 'image' : 'video';
        const reader = new FileReader();
        reader.onload = e => {
            // Add a unique ID using Date.now() + random number
            const tempId = Date.now() + Math.random(); 
            postMedia.push({ 
                id: tempId, 
                file, 
                type, 
                mimeType: file.type, 
                url: e.target.result 
            });
            renderMediaPreviews();
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};
window.removePostMedia = () => {
postMedia = null;
document.getElementById('post-media-preview').innerHTML = '';
document.getElementById('post-media-preview').style.display = 'none';
document.getElementById('post-media').value = '';
document.getElementById('remove-media-btn').style.display = 'none';
};
// ── Auth state listener ───────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
if (!user) {
document.getElementById('login-btn').classList.remove('hidden');
document.getElementById('nav-auth-controls').style.display = 'none';
document.getElementById('post-creator').classList.add('hidden');
document.getElementById('feed-tabs').classList.add('hidden');
const vb = document.getElementById('verify-banner');
if (vb) { vb.classList.add('hidden'); vb.style.display = ''; }
me = null;
return;
}
const ref = db.collection("users").doc(user.uid);
const snap = await ref.get();
// Block banned / deactivated users on login (admin UID is always immune)
if (snap.exists && !isAdminUID(user.uid)) {
const d = snap.data();
if (d.deactivated === true) {
await auth.signOut();
showMsg('auth-msg', "This account has been deactivated.");
openModal('auth-modal');
return;
}
if (d.rank === "Banned") {
if (d.bannedUntil) {
const until = d.bannedUntil.toDate
? d.bannedUntil.toDate()
: new Date(d.bannedUntil);
if (new Date() < until) {
await auth.signOut();
const mins = Math.ceil((until - new Date()) / 60000);
const tl = mins < 60
? `${mins} minute${mins !== 1 ? 's' : ''}`
: `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) !== 1 ? 's' : ''}`;
showMsg('auth-msg', `Your account is banned for another ${tl}.`);
openModal('auth-modal');
return;
}
await ref.update({ rank: "User", bannedUntil: firebase.firestore.FieldValue.delete() });
} else {
await auth.signOut();
showMsg('auth-msg', "Your account has been permanently banned.");
openModal('auth-modal');
return;
}
}
}
// Show logged-in nav
document.getElementById('login-btn').classList.add('hidden');
document.getElementById('nav-auth-controls').style.display = 'flex';
document.getElementById('feed-tabs').classList.remove('hidden');
// Create Firestore doc for brand-new users
if (!snap.exists) {
await ref.set({
displayName: user.email.split('@')[0],
rank: isAdminUID(user.uid) ? "Admin" : "User",
verified: isAdminUID(user.uid),
bio: "",
photoURL: "",
followers: [],
following: [],
blocked: [],
friends: [],
friendRequestsSent:[],
friendRequestsIn: [],
createdAt: firebase.firestore.FieldValue.serverTimestamp()
});
} else {
// Migrate any missing fields silently
const data = snap.data();
const upd = {};
if (!Array.isArray(data.followers)) upd.followers = [];
if (!Array.isArray(data.following)) upd.following = [];
if (!Array.isArray(data.blocked)) upd.blocked = [];
if (!Array.isArray(data.friends)) upd.friends = [];
if (!Array.isArray(data.friendRequestsSent)) upd.friendRequestsSent = [];
if (!Array.isArray(data.friendRequestsIn)) upd.friendRequestsIn = [];
if (typeof data.photoURL === 'undefined') upd.photoURL = "";
if (!data.createdAt) {
const authDate = user.metadata?.creationTime
? new Date(user.metadata.creationTime)
: null;
upd.createdAt = authDate
? firebase.firestore.Timestamp.fromDate(authDate)
: firebase.firestore.FieldValue.serverTimestamp();
}
if (isAdminUID(user.uid) && data.rank !== "Admin") upd.rank = "Admin";
if (Object.keys(upd).length) await ref.update(upd);
}
// Live listener on own user document
ref.onSnapshot(doc => {
if (!doc.exists) return;
const data = doc.data();
// Auto-lift expired timed bans
if (data.rank === "Banned" && data.bannedUntil && !isAdminUID(user.uid)) {
const until = data.bannedUntil.toDate
? data.bannedUntil.toDate()
: new Date(data.bannedUntil);
if (new Date() >= until) {
ref.update({ rank: "User", bannedUntil: firebase.firestore.FieldValue.delete() });
return;
}
auth.signOut();
location.reload();
return;
}
// Kick live banned users (not admin)
if (data.rank === "Banned" && !isAdminUID(user.uid)) {
auth.signOut();
location.reload();
return;
}
// Build the 'me' object — admin UID always gets Admin rank in memory
me = {
id: user.uid,
...data,
rank: isAdminUID(user.uid) ? "Admin" : (data.rank || "User")
};
allUsers[user.uid] = { ...data, rank: me.rank };
// Show admin button only for admin UID
document.getElementById('admin-btn')
.classList.toggle('hidden', !isAdminUID(user.uid) && me.rank !== "Admin");
// Update nav username + friend request badge
const navName = document.getElementById('nav-username');
if (navName) {
navName.textContent = me.displayName || "";
const reqCount = (me.friendRequestsIn || []).length;
let badge = document.getElementById('nav-friend-badge');
if (reqCount > 0) {
if (!badge) {
badge = document.createElement('span');
badge.id = 'nav-friend-badge';
badge.className = 'req-badge';
navName.after(badge);
}
badge.textContent = reqCount;
} else if (badge) {
badge.remove();
}
}
// Show post creator only if email is verified (or admin)
const canPost = user.emailVerified || isAdminUID(user.uid);
document.getElementById('post-creator').classList.toggle('hidden', !canPost);
// Show attach media button only if account is old enough
const canAttachMedia = canPost && accountOlderThan(me.createdAt, 3600);
document.getElementById('attach-media-btn').style.display = canAttachMedia ? '' : 'none';
const vb = document.getElementById('verify-banner');
if (vb) {
vb.classList.toggle('hidden', canPost);
if (!canPost) vb.style.display = 'flex';
}
renderFeed();
});
});
// ── Real-time Firestore listeners ─────────────────────────────────────
db.collection("users").onSnapshot({
next: snap => {
const fresh = {};
snap.forEach(d => fresh[d.id] = d.data());
// Remove deleted users from local cache
Object.keys(allUsers).forEach(uid => { if (!fresh[uid]) delete allUsers[uid]; });
Object.assign(allUsers, fresh);
usersReady = true;
if (postsReady) renderFeed();
},
error: err => {
console.error('Failed to load users:', err);
usersReady = true;
if (postsReady) renderFeed();
}
});
db.collection("posts").orderBy("createdAt", "desc").onSnapshot({
next: snap => {
allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
postsReady = true;
if (usersReady) renderFeed();
if (currentProfileUid) refreshProfileTabs(currentProfileUid);
},
error: err => {
console.error('Failed to load posts:', err);
postsReady = true;
if (usersReady) renderFeed();
}
});
// ── Feed rendering ────────────────────────────────────────────────────
window.switchFeedTab = tab => {
currentFeedTab = tab;
document.getElementById('ftab-all') .classList.toggle('active', tab === 'all');
document.getElementById('ftab-following').classList.toggle('active', tab === 'following');
document.getElementById('ftab-friends') .classList.toggle('active', tab === 'friends');
renderFeed();
};
function renderFeed() {
    const feed = document.getElementById('main-feed');
    feed.innerHTML = "";
    const blocked = me ? (me.blocked || []) : [];
    let roots = allPosts.filter(p =>
        !p.parentId &&
        allUsers[p.authorUid] &&
        !blocked.includes(p.authorUid)
    );

    // Update Following tab logic
    if (currentFeedTab === 'following' && me) {
        const following = me.following || [];
        // Removed: || p.authorUid === me.id
        roots = roots.filter(p => following.includes(p.authorUid)); 
    }

    // Update Friends tab logic
    if (currentFeedTab === 'friends' && me) {
        const friends = me.friends || [];
        // Removed: || p.authorUid === me.id
        roots = roots.filter(p => friends.includes(p.authorUid));
    }

    if (!roots.length) {
        const msg = currentFeedTab === 'following'
            ? "No posts from people you follow yet."
            : "No posts from any friends yet.";
        feed.innerHTML = `<p id="feed-empty">${msg}</p>`;
        return;
    }
    roots.forEach(p => feed.appendChild(buildPost(p, 0)));
}
// ── Build a single post card ──────────────────────────────────────────
function buildPost(post, depth) {
const u = allUsers[post.authorUid] || { displayName: "Deleted User", rank: "User", verified: false };
const isBan = u.rank === "Banned";
const isDeact = u.deactivated === true;
const canDel = me && (me.id === post.authorUid || me.rank === "Admin");
const likes = post.likes || [];
const isLiked = me && likes.includes(me.id);
const views = post.views || [];
const canSeeViewers = me && (me.id === post.authorUid || me.rank === "Admin");
const emailOk = me && (auth.currentUser?.emailVerified || me.rank === "Admin");
const isFriendPost = me && (me.friends || []).includes(post.authorUid);
// Record post view (top-level posts only, not your own)
if (depth === 0 && me && me.id !== post.authorUid && !views.includes(me.id)) {
db.collection("posts").doc(post.id)
.update({ views: firebase.firestore.FieldValue.arrayUnion(me.id) })
.catch(() => {});
}
const wrap = document.createElement('div');
wrap.className = depth === 0 ? "post" : "reply-box";
if (depth === 0) wrap.dataset.postId = post.id;
// ── Header row ──
const header = document.createElement('div');
header.className = "post-header";
// Mini avatar
const miniAv = document.createElement('div');
miniAv.style.cssText = [
"width:26px", "height:26px", "border-radius:50%",
"background:rgba(56,189,248,0.15)", "border:1px solid var(--primary)",
"display:flex", "align-items:center", "justify-content:center",
"font-size:0.7rem", "font-weight:700", "color:var(--primary)",
"overflow:hidden", "flex-shrink:0", "cursor:pointer"
].join(';');
miniAv.onclick = () => openProfile(post.authorUid);
if (u.photoURL) {
miniAv.innerHTML = `<img src="${u.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
} else {
miniAv.textContent = (u.displayName || "?")[0].toUpperCase();
}
header.appendChild(miniAv);
// Author name
const authorBtn = document.createElement('span');
authorBtn.className = "author-btn";
authorBtn.textContent = u.displayName;
authorBtn.onclick = () => openProfile(post.authorUid);
header.appendChild(authorBtn);
// Verified checkmark
if (u.verified) {
const vc = document.createElement('span');
vc.className = "v-check";
vc.textContent = "\u2714";
header.appendChild(vc);
}
// Friend badge OR rank badge
if (isFriendPost) {
const fb = document.createElement('span');
fb.className = "badge badge-friend";
fb.textContent = "Friend";
header.appendChild(fb);
} else {
const rb = document.createElement('span');
rb.className = "badge " + rankBadgeClass(u.rank);
rb.textContent = u.rank || "User";
header.appendChild(rb);
}
// Timestamp
if (post.createdAt) {
const ts = document.createElement('span');
ts.style.cssText = "font-size:0.72rem; color:var(--muted); margin-left:auto; white-space:nowrap;";
const date = post.createdAt.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
const now = new Date();
const diff = Math.floor((now - date) / 1000);
if (diff < 60) ts.textContent = "just now";
else if (diff < 3600) ts.textContent = `${Math.floor(diff / 60)}m ago`;
else if (diff < 86400) ts.textContent = `${Math.floor(diff / 3600)}h ago`;
else if (diff < 86400*7) ts.textContent = `${Math.floor(diff / 86400)}d ago`;
else ts.textContent = date.toLocaleDateString(undefined, {
month: 'short', day: 'numeric',
year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
});
ts.title = date.toLocaleString();
header.appendChild(ts);
}
wrap.appendChild(header);
// ── Post body ──
const txt = document.createElement('p');
txt.className = "post-text";
txt.textContent = isBan ? "[This user has been banned]" : post.text;
if (isBan) txt.style.opacity = "0.4";
wrap.appendChild(txt);
// ── Media ──
if (post.mediaList && post.mediaList.length > 0 && !isBan) {
    const grid = document.createElement('div');
    const count = post.mediaList.length;
    grid.style.cssText = `display: grid; grid-template-columns: ${count === 1 ? '1fr' : '1fr 1fr'}; gap: 8px; margin-top: 10px;    /* Space between text and image */margin-bottom: 15px; /* Space between image and Like/Reply buttons */`;

    post.mediaList.forEach(media => {
        const isVideo = (media.type || '').startsWith('video/');
        const mediaEl = document.createElement(isVideo ? 'video' : 'img');
        mediaEl.src = media.url;
        mediaEl.style.cssText = `width:100%; height:${count === 1 ? 'auto' : '180px'}; object-fit:cover; border-radius:8px; cursor:pointer;`;
        if (isVideo) mediaEl.controls = true;
        
        mediaEl.onclick = () => {
            const container = document.getElementById('media-container');
            openModal('media-modal');
            container.innerHTML = isVideo 
                ? `<video controls autoplay style="max-width:100%;max-height:80vh;"><source src="${media.url}"></video>`
                : `<img src="${media.url}" style="max-width:100%;max-height:80vh;">`;
        };
        grid.appendChild(mediaEl);
    });
    wrap.appendChild(grid);
}
// Deactivated note
if (isDeact) {
const note = document.createElement('p');
note.style.cssText = "font-size:0.72rem; color:var(--muted); margin:0 0 6px; font-style:italic;";
note.textContent = "⏸ This account has been deactivated";
wrap.appendChild(note);
}
// ── Action bar (like, reply, delete, views) ──
if (!isBan && !isDeact) {
const actions = document.createElement('div');
actions.className = "post-actions";
// Like button
const likeBtn = document.createElement('span');
likeBtn.className = "like-btn" + (isLiked ? " liked" : "");
likeBtn.innerHTML = `\u2665 <span class="like-count">${likes.length || ""}</span>`;
if (!me) {
likeBtn.style.opacity = "0.35";
likeBtn.style.cursor = "default";
likeBtn.title = "Login to like";
} else if (!emailOk) {
likeBtn.style.opacity = "0.35";
likeBtn.style.cursor = "default";
likeBtn.title = "Verify your email to like posts";
} else {
likeBtn.onclick = () => toggleLike(post.id, likes, likeBtn);
}
actions.appendChild(likeBtn);
// Reply button
const replySpan = document.createElement('span');
replySpan.textContent = "Reply";
if (!me) {
replySpan.style.opacity = "0.35";
replySpan.style.cursor = "default";
replySpan.title = "Login to reply";
} else if (!emailOk) {
replySpan.style.opacity = "0.35";
replySpan.style.cursor = "default";
replySpan.title = "Verify your email to reply";
} else {
replySpan.onclick = () => replyWrap.classList.toggle('open');
}
actions.appendChild(replySpan);
// Delete button (author or admin)
if (canDel) {
const delSpan = document.createElement('span');
delSpan.className = "del-btn";
delSpan.textContent = "Delete";
delSpan.onclick = () => deletePost(post.id);
actions.appendChild(delSpan);
}
// View count (top-level posts only)
if (depth === 0) {
const viewSpan = document.createElement('span');
viewSpan.style.cssText = "margin-left:auto; display:flex; align-items:center; gap:4px; font-size:0.78rem; color:var(--muted);";
viewSpan.innerHTML = `&#128065; ${views.length}`;
if (canSeeViewers && views.length > 0) {
viewSpan.title = "Click to see who viewed this";
viewSpan.style.cursor = "pointer";
viewSpan.onclick = () => openViewersModal(post.id, views);
} else {
viewSpan.title = `${views.length} view${views.length !== 1 ? 's' : ''}`;
}
actions.appendChild(viewSpan);
}
wrap.appendChild(actions);
// Reply input
const replyWrap = document.createElement('div');
replyWrap.className = "reply-input-wrap";
if (me && emailOk) {
const ri = document.createElement('input');
ri.placeholder = "Write a reply...";
ri.onkeydown = e => { if (e.key === "Enter") sendReply(post.id, ri, replyWrap); };
const rb2 = document.createElement('button');
rb2.className = "btn-sm";
rb2.textContent = "Send";
rb2.onclick = () => sendReply(post.id, ri, replyWrap);
replyWrap.appendChild(ri);
replyWrap.appendChild(rb2);
}
wrap.appendChild(replyWrap);
}
// ── Replies (collapsible) ──
const children = allPosts.filter(r => r.parentId === post.id);
if (children.length > 0 && depth === 0) {
const childWrap = document.createElement('div');
let collapsed = !expandedPosts.has(post.id);
childWrap.style.display = collapsed ? "none" : "";
const toggleRow = document.createElement('div');
toggleRow.style.cssText = "margin-top:6px;";
const toggleSpan = document.createElement('span');
toggleSpan.style.cssText = "font-size:0.78rem; color:var(--muted); cursor:pointer;";
const updateToggleLabel = () => {
const count = children.length;
const word = count === 1 ? 'reply' : 'replies';
toggleSpan.textContent = collapsed
? `\u25B8 Show ${count} ${word}`
: `\u25BE Hide ${count} ${word}`;
};
updateToggleLabel();
toggleSpan.onclick = () => {
collapsed = !collapsed;
collapsed ? expandedPosts.delete(post.id) : expandedPosts.add(post.id);
childWrap.style.display = collapsed ? "none" : "";
updateToggleLabel();
};
toggleRow.appendChild(toggleSpan);
wrap.appendChild(toggleRow);
children.forEach(r => childWrap.appendChild(buildPost(r, depth + 1)));
wrap.appendChild(childWrap);
} else {
children.forEach(r => wrap.appendChild(buildPost(r, depth + 1)));
}
return wrap;
}
// ── Likes ─────────────────────────────────────────────────────────────
function toggleLike(postId, currentLikes, btn) {
if (!me) return;
const liked = currentLikes.includes(me.id);
const newLikes = liked
? currentLikes.filter(id => id !== me.id)
: [...currentLikes, me.id];
db.collection("posts").doc(postId).update({ likes: newLikes });
btn.className = "like-btn" + (!liked ? " liked" : "");
btn.querySelector('.like-count').textContent = newLikes.length || "";
}
// ── Submit post ───────────────────────────────────────────────────────
window.submitPost = async () => {
    if (!me) return;

    // ── 1. Cooldown Check (10 Seconds) ──
    const now = Date.now();
    const cooldownMs = 10000; 
    if (now - lastPostTime < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastPostTime)) / 1000);
        alert(`Slow down! Please wait ${remaining} more second(s).`);
        return;
    }

    const body = document.getElementById('post-body');
    const val = body.value.trim();
    
    // Prevent empty posts (must have text OR media)
    if (!val && postMedia.length === 0) return;

    // ── 2. Profanity Filter ──
    if (containsProfanity(val)) {
        body.style.borderColor = "var(--danger)";
        alert("Your post contains inappropriate language.");
        return;
    }

    const btn = document.querySelector('#post-creator button[onclick="submitPost()"]');
    btn.disabled = true;
    btn.textContent = "Processing...";

    try {
        // ── 3. Process Multi-Media Array ──
        let mediaArray = [];
        for (let item of postMedia) {
            let processedUrl = "";
            let processedType = item.mimeType || item.type;

            if (item.type === 'image') {
                // Uses the smart compression function we built earlier
                processedUrl = await compressImage(item.file);
            } else {
                processedUrl = await fileToBase64(item.file);
            }

            mediaArray.push({
                url: processedUrl,
                type: processedType
            });
        }

        // ── 4. Firestore 1MB Payload Check ──
        const payloadSize = JSON.stringify(mediaArray).length + val.length;
        if (payloadSize > 1040000) {
            alert("The total size of your images is too large. Try fewer images or lower resolution.");
            btn.disabled = false;
            btn.textContent = "Post";
            return;
        }

        // ── 5. Upload to Firestore ──
        await db.collection("posts").add({
            text: val, // We keep the raw text here; the "[Image]" label is handled in buildPost
            authorUid: me.id,
            parentId: null,
            likes: [],
            views: [],
            mediaList: mediaArray,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // ── 6. Cleanup & Reset ──
        lastPostTime = Date.now(); // Reset cooldown timer
        body.value = "";
        postMedia = [];
        renderMediaPreviews();
        console.log("Post successful!");

    } catch (e) {
        console.error('Submission Error:', e);
        alert('Failed to post: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Post";
    }
};
// ── Send reply ────────────────────────────────────────────────────────
// ── Image Compression Helper ──────────────────────────────────────────
// ── Smart Image Compression ──────────────────────────────────────────
// ── Image Compression Helper ──────────────────────────────────────────
async function compressImage(file) {
    const fileSizeMB = file.size / (1024 * 1024);
    let quality = 0.8;
    let maxWidth = 1600;

    if (fileSizeMB > 1) {
        quality = 0.3; 
        maxWidth = 800;
    } else if (fileSizeMB > 0.5) {
        quality = 0.5;
        maxWidth = 1200;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxWidth) {
                    const ratio = Math.min(maxWidth / width, maxWidth / height);
                    width *= ratio; height *= ratio;
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl.length > 1000000 ? canvas.toDataURL('image/jpeg', 0.1) : dataUrl);
            };
        };
    });
}

// ── Multi-Media Handling ─────────────────────────────────────────────
window.handlePostMedia = input => {
    const files = Array.from(input.files);
    if (postMedia.length + files.length > 4) {
        alert('You can only upload a maximum of 4 images.');
        input.value = '';
        return;
    }

    files.forEach(file => {
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
        if (!type || (type === 'video' && postMedia.some(m => m.type === 'video'))) {
            alert('Images (max 4) or 1 video allowed.');
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            postMedia.push({ file, type, mimeType: file.type, url: e.target.result });
            renderMediaPreviews();
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

window.removePostMedia = () => {
    postMedia = [];
    renderMediaPreviews();
};
function sendReply(parentId, input, wrap) {
    if (!me) return;

    // ── 1. Cooldown Check ──
    const now = Date.now();
    if (now - lastPostTime < 10000) {
        const remaining = Math.ceil((10000 - (now - lastPostTime)) / 1000);
        alert(`Please wait ${remaining}s before replying.`);
        return;
    }

    const val = input.value.trim();
    
    // Replies usually require text since they don't support media in your current setup
    if (!val) return;

    // ── 2. Profanity Filter ──
    if (containsProfanity(val)) {
        input.style.borderColor = "var(--danger)";
        const orig = input.placeholder;
        input.placeholder = "⚠️ Language not allowed";
        setTimeout(() => {
            input.style.borderColor = "";
            input.placeholder = orig;
        }, 2500);
        return;
    }

    // ── 3. Upload Reply ──
    db.collection("posts").add({
        text: val,
        authorUid: me.id,
        parentId,
        likes: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        // ── 4. Success & Cleanup ──
        lastPostTime = Date.now(); // Update cooldown
        input.value = "";
        wrap.classList.remove('open');
        
        // Expand the thread so the user sees their reply
        expandedPosts.add(findRootPostId(parentId));
    }).catch(err => {
        console.error("Reply Error:", err);
        alert("Failed to send reply.");
    });
}
// ── Delete post ───────────────────────────────────────────────────────
window.deletePost = async id => {
if (!confirm("Delete this post and all its replies? This CANNOT be undone.")) return;
expandedPosts.delete(id);
// Collect all descendants recursively (not just direct children)
const toDelete = [id];
function collectDescendants(parentId) {
allPosts.filter(p => p.parentId === parentId).forEach(p => {
toDelete.push(p.id);
collectDescendants(p.id);
});
}
collectDescendants(id);
for (let i = 0; i < toDelete.length; i += 400) {
const batch = db.batch();
toDelete.slice(i, i + 400).forEach(pid => batch.delete(db.collection("posts").doc(pid)));
await batch.commit();
}
};
function findRootPostId(postId) {
const post = allPosts.find(p => p.id === postId);
if (!post || !post.parentId) return postId;
return findRootPostId(post.parentId);
}
// ── Search ────────────────────────────────────────────────────────────
document.getElementById('search-bar').addEventListener('input', function () {
const q = this.value.toLowerCase().trim();
const res = document.getElementById('search-results');
if (!q) { res.style.display = 'none'; return; }
const matches = Object.keys(allUsers)
.filter(uid => (allUsers[uid].displayName || "").toLowerCase().includes(q));
res.innerHTML = "";
if (!matches.length) {
res.innerHTML = '<div class="search-item" style="color:var(--muted)">No users found</div>';
} else {
matches.forEach(uid => {
const u = allUsers[uid];
const item = document.createElement('div');
item.className = "search-item";
item.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.textContent = u.displayName;
item.appendChild(nm);
const rk = document.createElement('span');
rk.style.cssText = "font-size:0.75rem; color:var(--muted);";
rk.textContent = u.rank;
item.appendChild(rk);
item.onclick = () => {
openProfile(uid);
res.style.display = 'none';
document.getElementById('search-bar').value = "";
};
res.appendChild(item);
});
}
res.style.display = 'block';
});
document.addEventListener('click', e => {
if (!document.querySelector('.search-wrap').contains(e.target)) {
document.getElementById('search-results').style.display = 'none';
}
});
// ── Profile modal ─────────────────────────────────────────────────────
window.openProfile = uid => {
currentProfileUid = uid;
const u = allUsers[uid];
if (!u) return;
renderAvatarEl(document.getElementById('prof-avatar'), u);
document.getElementById('prof-name').textContent = u.displayName;
const verEl = document.getElementById('prof-verified');
u.verified ? verEl.classList.remove('hidden') : verEl.classList.add('hidden');
const rw = document.getElementById('prof-rank-wrap');
rw.innerHTML = "";
const badge = document.createElement('span');
badge.className = "badge " + rankBadgeClass(u.rank);
badge.textContent = u.rank || "User";
rw.appendChild(badge);
document.getElementById('prof-bio').textContent = u.bio || "No bio set.";
const ageEl = document.getElementById('prof-account-age');
if (ageEl) {
if (u.createdAt) {
ageEl.textContent = `\uD83D\uDCC5 Account ${formatAccountAge(u.createdAt)}`;
} else if (uid === auth.currentUser?.uid && auth.currentUser.metadata?.creationTime) {
ageEl.textContent = `\uD83D\uDCC5 Account ${formatAccountAge(new Date(auth.currentUser.metadata.creationTime))}`;
} else {
ageEl.textContent = "";
}
}
// Action row (Follow / Friend / Block)
const ar = document.getElementById('prof-action-row');
if (!me || uid === me.id || (allUsers[uid] && allUsers[uid].deactivated)) {
ar.classList.add('hidden');
} else {
ar.classList.remove('hidden');
const fb = document.getElementById('follow-btn');
const frd = document.getElementById('friend-btn');
const bb = document.getElementById('block-btn');
const isFol = (me.following || []).includes(uid);
const isBlk = (me.blocked || []).includes(uid);
const isFriend = (me.friends || []).includes(uid);
const sentReq = (me.friendRequestsSent || []).includes(uid);
const gotReq = (me.friendRequestsIn || []).includes(uid);
fb.textContent = isFol ? "Following" : "+ Follow";
fb.className = "btn-follow" + (isFol ? " following" : "");
fb.disabled = isBlk; // Disable follow when user is blocked
bb.textContent = isBlk ? "\uD83D\uDEAB Blocked" : "Block";
bb.className = "btn-block" + (isBlk ? " blocked" : "");
if (frd) {
frd.disabled = isBlk; // Disable friend actions when user is blocked
if (isFriend) {
frd.textContent = "\uD83D\uDC65 Friends";
frd.className = "btn-friend";
} else if (gotReq) {
frd.textContent = "Accept Friend";
frd.className = "btn-friend";
} else if (sentReq) {
frd.textContent = "Request Sent";
frd.className = "btn-friend-pending";
} else {
frd.textContent = "+ Add Friend";
frd.className = "btn-ghost";
frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";
}
}
}
refreshProfileTabs(uid);
switchProfileTab('posts');
openModal('profile-modal');
};
// ── Profile tab content ───────────────────────────────────────────────
function refreshProfileTabs(uid) {
const u = allUsers[uid];
if (!u) return;
const uPosts = allPosts.filter(p => p.authorUid === uid && !p.parentId);
const uReplies = allPosts.filter(p => p.authorUid === uid && p.parentId);
const followers = u.followers || [];
const following = u.following || [];
const friends = u.friends || [];
document.getElementById('stat-posts') .textContent = uPosts.length;
document.getElementById('stat-replies') .textContent = uReplies.length;
document.getElementById('stat-followers').textContent = followers.length;
document.getElementById('stat-following').textContent = following.length;
document.getElementById('stat-friends') .textContent = friends.length;
// Posts tab
const postsEl = document.getElementById('content-posts');
postsEl.innerHTML = "";
if (!uPosts.length) {
postsEl.innerHTML = '<div class="empty-tab">No posts yet.</div>';
} else {
uPosts.forEach(post => {
const rc = allPosts.filter(r => r.parentId === post.id).length;
const lc = (post.likes || []).length;
const card = document.createElement('div');
card.className = "prof-post-card";
card.innerHTML = `<div>${post.text && post.text.trim() !== "" ? post.text : '<span style="color:var(--muted); font-style:italic; font-size:0.9rem;">[Image]</span>'}</div>
<div class="prof-post-meta">\u2665 ${lc} &middot; ${rc} ${rc === 1 ? 'reply' : 'replies'}</div>`;
card.onclick = () => {
closeAll();
setTimeout(() => {
const el = document.querySelector(`[data-post-id="${post.id}"]`);
if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 100);
};
postsEl.appendChild(card);
});
}
// Replies tab
const repliesEl = document.getElementById('content-replies');
repliesEl.innerHTML = "";
if (!uReplies.length) {
repliesEl.innerHTML = '<div class="empty-tab">No replies yet.</div>';
} else {
uReplies.forEach(reply => {
const parent = allPosts.find(p => p.id === reply.parentId);
const lc = (reply.likes || []).length;
const card = document.createElement('div');
card.className = "prof-post-card";
card.innerHTML = `<div>${reply.text}</div>
<div class="prof-post-meta">\u2665 ${lc} &middot; replying to:
${parent ? parent.text.slice(0, 40) + (parent.text.length > 40 ? '...' : '') : 'deleted post'}
</div>`;
const rootId = findRootPostId(reply.parentId);
card.onclick = () => {
closeAll();
setTimeout(() => {
const el = document.querySelector(`[data-post-id="${rootId}"]`);
if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 100);
};
repliesEl.appendChild(card);
});
}
buildUserList('content-followers', followers, 'No followers yet.');
buildUserList('content-following', following, 'Not following anyone yet.');
buildUserList('content-friends', friends, 'No friends yet.');
}
function buildUserList(containerId, uids, emptyMsg) {
const el = document.getElementById(containerId);
el.innerHTML = "";
const valid = uids.filter(uid => allUsers[uid]);
if (!valid.length) {
el.innerHTML = `<div class="empty-tab">${emptyMsg}</div>`;
return;
}
valid.forEach(uid => {
const u = allUsers[uid];
const row = document.createElement('div');
row.className = "follower-row";
row.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.className = "follower-name";
nm.textContent = u.displayName;
row.appendChild(nm);
row.onclick = () => openProfile(uid);
el.appendChild(row);
});
}
window.switchProfileTab = tab => {
['posts', 'replies', 'followers', 'following', 'friends'].forEach(t => {
document.getElementById(`ptab-${t}`) .classList.toggle('active', t === tab);
document.getElementById(`content-${t}`).classList.toggle('active', t === tab);
});
};
// ── Follow / Unfollow ─────────────────────────────────────────────────
window.toggleFollow = async () => {
if (!me || !currentProfileUid || currentProfileUid === me.id) return;
const tuid = currentProfileUid;
const fb = document.getElementById('follow-btn');
// Prevent following blocked users or users who blocked you
if ((me.blocked || []).includes(tuid)) return;
if ((allUsers[tuid]?.blocked || []).includes(me.id)) return;
fb.disabled = true;
const isFol = (me.following || []).includes(tuid);
try {
const batch = db.batch();
if (isFol) {
batch.update(db.collection("users").doc(me.id), { following: firebase.firestore.FieldValue.arrayRemove(tuid) });
batch.update(db.collection("users").doc(tuid), { followers: firebase.firestore.FieldValue.arrayRemove(me.id) });
} else {
batch.update(db.collection("users").doc(me.id), { following: firebase.firestore.FieldValue.arrayUnion(tuid) });
batch.update(db.collection("users").doc(tuid), { followers: firebase.firestore.FieldValue.arrayUnion(me.id) });
}
await batch.commit();
fb.textContent = isFol ? "+ Follow" : "Following";
fb.className = "btn-follow" + (isFol ? "" : " following");
} catch(e) { /* silently fail */ }
fb.disabled = false;
};
// ── Friend requests ───────────────────────────────────────────────────
// KEY: Each doc may only appear ONCE per batch.
// We merge all changes for each doc into a single object before calling batch.update().
window.toggleFriendRequest = async () => {
if (!me || !currentProfileUid || currentProfileUid === me.id) return;
const tuid = currentProfileUid;
// Prevent friend requests with blocked users
if ((me.blocked || []).includes(tuid)) return;
if ((allUsers[tuid]?.blocked || []).includes(me.id)) return;
const isFriend = (me.friends || []).includes(tuid);
const sentReq = (me.friendRequestsSent || []).includes(tuid);
const gotReq = (me.friendRequestsIn || []).includes(tuid);
const frd = document.getElementById('friend-btn');
frd.disabled = true;
try {
if (isFriend) {
// ── Unfriend ──
if (!confirm(`Remove ${allUsers[tuid]?.displayName} as a friend?`)) { frd.disabled = false; return; }
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), { friends: firebase.firestore.FieldValue.arrayRemove(tuid) });
batch.update(db.collection("users").doc(tuid), { friends: firebase.firestore.FieldValue.arrayRemove(me.id) });
await batch.commit();
frd.textContent = "+ Add Friend";
frd.className = "btn-ghost";
frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";
} else if (gotReq) {
// ── Accept incoming request ──
await respondFriendRequest(tuid, true);
} else if (sentReq) {
// ── Cancel outgoing request ──
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), { friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(tuid) });
batch.update(db.collection("users").doc(tuid), { friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(me.id) });
await batch.commit();
frd.textContent = "+ Add Friend";
frd.className = "btn-ghost";
frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";
} else {
// ── Send friend request ──
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), { friendRequestsSent: firebase.firestore.FieldValue.arrayUnion(tuid) });
batch.update(db.collection("users").doc(tuid), { friendRequestsIn: firebase.firestore.FieldValue.arrayUnion(me.id) });
await batch.commit();
frd.textContent = "Request Sent";
frd.className = "btn-friend-pending";
}
} catch(e) { /* silently fail */ }
frd.disabled = false;
};
// Accept or decline a friend request.
// CRITICAL: merge all updates for each doc into one batch.update call — Firestore
// only allows a single write per document per batch. Double-writing the same doc
// causes the second write to silently overwrite the first, which is the bug that
// made accepted requests re-appear.
async function respondFriendRequest(fromUid, accept) {
const myUpdate = {
friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(fromUid)
};
const thUpdate = {
friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(me.id)
};
if (accept) {
myUpdate.friends = firebase.firestore.FieldValue.arrayUnion(fromUid);
thUpdate.friends = firebase.firestore.FieldValue.arrayUnion(me.id);
}
try {
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), myUpdate); // ONE write to my doc
batch.update(db.collection("users").doc(fromUid), thUpdate); // ONE write to their doc
await batch.commit();
// Refresh profile modal if it's open on this user
if (currentProfileUid === fromUid) openProfile(fromUid);
} catch (e) {
if (e.code === 'permission-denied') {
alert('Permission denied. Please check your Firestore security rules (read/write access for this operation).');
} else {
console.error('Failed to respond to friend request', e);
}
}
}
// ── Block / Unblock ───────────────────────────────────────────────────
window.toggleBlock = async () => {
if (!me || !currentProfileUid || currentProfileUid === me.id) return;
const tuid = currentProfileUid;
const isBlk = (me.blocked || []).includes(tuid);
if (!isBlk && !confirm(`Block ${allUsers[tuid]?.displayName}? Their posts will be hidden from your feed and any follow/friend connections will be removed.`)) return;
const bb = document.getElementById('block-btn');
const fb = document.getElementById('follow-btn');
const frd = document.getElementById('friend-btn');
bb.disabled = true;
try {
const batch = db.batch();
if (isBlk) {
// Unblocking
batch.update(db.collection("users").doc(me.id), { blocked: firebase.firestore.FieldValue.arrayRemove(tuid) });
} else {
// Blocking — sever all follow and friend relationships in both directions
batch.update(db.collection("users").doc(me.id), {
blocked: firebase.firestore.FieldValue.arrayUnion(tuid),
following: firebase.firestore.FieldValue.arrayRemove(tuid),
followers: firebase.firestore.FieldValue.arrayRemove(tuid),
friends: firebase.firestore.FieldValue.arrayRemove(tuid),
friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(tuid),
friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(tuid)
});
batch.update(db.collection("users").doc(tuid), {
followers: firebase.firestore.FieldValue.arrayRemove(me.id),
following: firebase.firestore.FieldValue.arrayRemove(me.id),
friends: firebase.firestore.FieldValue.arrayRemove(me.id),
friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(me.id),
friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(me.id)
});
}
await batch.commit();
bb.textContent = isBlk ? "Block" : "\uD83D\uDEAB Blocked";
bb.className = "btn-block" + (isBlk ? "" : " blocked");
// Update follow/friend button state after blocking/unblocking
if (!isBlk) {
fb.textContent = "+ Follow"; fb.className = "btn-follow"; fb.disabled = true;
if (frd) { frd.textContent = "+ Add Friend"; frd.className = "btn-ghost"; frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;"; frd.disabled = true; }
} else {
fb.disabled = false;
if (frd) frd.disabled = false;
}
} catch(e) { /* silently fail */ }
bb.disabled = false;
};
// ── Settings ──────────────────────────────────────────────────────────
window.switchSettingsTab = tab => {
const tabs = ['profile', 'following', 'friends', 'blocked', 'account'];
document.querySelectorAll('.settings-tab')
.forEach((el, i) => el.classList.toggle('active', tabs[i] === tab));
document.querySelectorAll('.settings-pane')
.forEach(el => el.classList.remove('active'));
document.getElementById(`spane-${tab}`).classList.add('active');
if (tab === 'following') renderSettingsFollowing();
if (tab === 'friends') renderSettingsFriends();
if (tab === 'blocked') renderSettingsBlocked();
};
// Following list
function renderSettingsFollowing() {
const list = document.getElementById('settings-following-list');
list.innerHTML = "";
const following = me?.following || [];
if (!following.length) {
list.innerHTML = '<div class="empty-tab">You\'re not following anyone yet.</div>';
return;
}
following.forEach(uid => {
const u = allUsers[uid];
if (!u) return;
const row = document.createElement('div');
row.className = "follower-row";
row.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.className = "follower-name";
nm.textContent = u.displayName;
nm.onclick = () => openProfile(uid);
nm.style.cursor = "pointer";
row.appendChild(nm);
const ufBtn = document.createElement('button');
ufBtn.className = "unblock-btn";
ufBtn.textContent = "Unfollow";
ufBtn.onclick = async () => {
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), { following: firebase.firestore.FieldValue.arrayRemove(uid) });
batch.update(db.collection("users").doc(uid), { followers: firebase.firestore.FieldValue.arrayRemove(me.id) });
await batch.commit();
renderSettingsFollowing();
};
row.appendChild(ufBtn);
list.appendChild(row);
});
}
// Friends list (with incoming requests at top)
function renderSettingsFriends() {
const reqsContainer = document.getElementById('settings-friends-requests');
const list = document.getElementById('settings-friends-list');
reqsContainer.innerHTML = "";
list.innerHTML = "";
// ── Incoming requests section ──
const reqs = (me?.friendRequestsIn || []).filter(uid => allUsers[uid]);
if (reqs.length) {
const hdr = document.createElement('p');
hdr.style.cssText = "font-size:0.8rem; font-weight:700; color:var(--text); margin:0 0 10px;";
hdr.textContent = `Incoming Friend Requests (${reqs.length})`;
reqsContainer.appendChild(hdr);
reqs.forEach(uid => {
const u = allUsers[uid];
const card = document.createElement('div');
card.className = "friend-req-card";
card.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.style.cssText = "font-weight:600; font-size:0.88rem; flex:1; cursor:pointer;";
nm.textContent = u.displayName;
nm.onclick = () => { closeModal('settings-modal'); openProfile(uid); };
card.appendChild(nm);
const btnWrap = document.createElement('div');
btnWrap.className = "req-btns";
const acc = document.createElement('button');
acc.className = "btn-sm";
acc.textContent = "Accept";
acc.onclick = async () => {
acc.disabled = true;
acc.textContent = "...";
await respondFriendRequest(uid, true);
renderSettingsFriends();
};
const dec = document.createElement('button');
dec.className = "btn-sm btn-ghost";
dec.textContent = "Decline";
dec.onclick = async () => {
dec.disabled = true;
dec.textContent = "...";
await respondFriendRequest(uid, false);
renderSettingsFriends();
};
btnWrap.appendChild(acc);
btnWrap.appendChild(dec);
card.appendChild(btnWrap);
reqsContainer.appendChild(card);
});
const divider = document.createElement('hr');
divider.className = "divider";
divider.style.margin = "14px 0";
reqsContainer.appendChild(divider);
}
// ── Friends list section ──
const friends = (me?.friends || []).filter(uid => allUsers[uid]);
const fhdr = document.createElement('p');
fhdr.style.cssText = "font-size:0.8rem; font-weight:700; color:var(--text); margin:0 0 10px;";
fhdr.textContent = `Friends (${friends.length})`;
list.appendChild(fhdr);
if (!friends.length) {
const em = document.createElement('div');
em.className = "empty-tab";
em.textContent = "No friends yet. Add friends from their profile!";
list.appendChild(em);
return;
}
friends.forEach(uid => {
const u = allUsers[uid];
const row = document.createElement('div');
row.className = "follower-row";
row.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.className = "follower-name";
nm.textContent = u.displayName;
nm.onclick = () => { closeModal('settings-modal'); openProfile(uid); };
nm.style.cursor = "pointer";
row.appendChild(nm);
const ufBtn = document.createElement('button');
ufBtn.className = "unblock-btn";
ufBtn.textContent = "Unfriend";
ufBtn.onclick = async () => {
const batch = db.batch();
batch.update(db.collection("users").doc(me.id), { friends: firebase.firestore.FieldValue.arrayRemove(uid) });
batch.update(db.collection("users").doc(uid), { friends: firebase.firestore.FieldValue.arrayRemove(me.id) });
await batch.commit();
renderSettingsFriends();
};
row.appendChild(ufBtn);
list.appendChild(row);
});
}
// Blocked list
function renderSettingsBlocked() {
const list = document.getElementById('settings-blocked-list');
list.innerHTML = "";
const blocked = me?.blocked || [];
if (!blocked.length) {
list.innerHTML = '<div class="empty-tab">You haven\'t blocked anyone.</div>';
return;
}
blocked.forEach(uid => {
const u = allUsers[uid];
const row = document.createElement('div');
row.className = "blocked-row";
row.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.className = "blocked-row-name";
nm.textContent = u?.displayName || "Unknown";
row.appendChild(nm);
const ubBtn = document.createElement('button');
ubBtn.className = "unblock-btn";
ubBtn.textContent = "Unblock";
ubBtn.onclick = async () => {
await db.collection("users").doc(me.id).update({ blocked: firebase.firestore.FieldValue.arrayRemove(uid) });
renderSettingsBlocked();
};
row.appendChild(ubBtn);
list.appendChild(row);
});
}
// Open settings modal
window.openSettings = () => {
if (!auth.currentUser) return;
document.getElementById('set-email-display').textContent = auth.currentUser.email || "";
document.getElementById('set-username').value = me ? (me.displayName || "") : "";
document.getElementById('set-bio').value = me ? (me.bio || "") : "";
clearMsg('profile-msg');
clearMsg('pass-msg');
renderAvatarEl(document.getElementById('settings-pfp-preview'), me);
const rb = document.getElementById('remove-pfp-btn');
if (rb) (me && me.photoURL) ? rb.classList.remove('hidden') : rb.classList.add('hidden');
const ad = document.getElementById('settings-account-age');
if (ad) {
if (me && me.createdAt) {
ad.textContent = `\uD83D\uDCC5 Account ${formatAccountAge(me.createdAt)}`;
} else if (auth.currentUser.metadata?.creationTime) {
ad.textContent = `\uD83D\uDCC5 Account ${formatAccountAge(new Date(auth.currentUser.metadata.creationTime))}`;
} else {
ad.textContent = "";
}
}
// PFP upload availability
const uploadBtn = document.querySelector('.pfp-upload-btn');
const isAdminPfp = isAdminUID(auth.currentUser.uid);
const isOld = isAdminPfp || (me ? accountOlderThan(me.createdAt, 3600) : false);
const emailVerified = isAdminPfp || auth.currentUser.emailVerified;
const canUpload = isOld && emailVerified;
if (uploadBtn) {
uploadBtn.disabled = !canUpload;
uploadBtn.style.opacity = canUpload ? "" : "0.4";
uploadBtn.title = !isOld
? "Account must be at least 1 hour old to upload a photo"
: !emailVerified
? "Must verify your email before uploading a photo"
: "";
}
// Friend request badge on the Friends tab button
const ftb = document.getElementById('friends-tab-btn');
if (ftb) {
const rc = (me?.friendRequestsIn || []).length;
ftb.innerHTML = rc > 0
? `Friends <span class="req-badge">${rc}</span>`
: "Friends";
}
switchSettingsTab('profile');
openModal('settings-modal');
};
// Save profile
window.saveMyProfile = async () => {
const name = document.getElementById('set-username').value.trim();
const bio = document.getElementById('set-bio').value;
if (!name) { showMsg('profile-msg', "Username cannot be empty.", "error"); return; }
if (containsProfanity(name)) { showMsg('profile-msg', "Username contains inappropriate language.", "error"); return; }
if (containsProfanity(bio)) { showMsg('profile-msg', "Bio contains inappropriate language.", "error"); return; }
try {
await db.collection("users").doc(me.id).update({ displayName: name, bio });
showMsg('profile-msg', "Profile saved!", "success");
} catch (e) {
showMsg('profile-msg', "Failed to save. Please try again.", "error");
}
};
// ── Profile photo upload ──────────────────────────────────────────────
window.handlePfpUpload = e => {
const file = e.target.files[0];
if (!file || !me) return;
const isAdminUp = isAdminUID(auth.currentUser?.uid);
if (!isAdminUp && !accountOlderThan(me.createdAt, 3600)) {
showMsg('profile-msg', "Account must be at least 1 hour old to upload a photo.", "error");
e.target.value = ""; return;
}
if (!isAdminUp && !auth.currentUser?.emailVerified) {
showMsg('profile-msg', "Must verify your email before uploading a photo.", "error");
e.target.value = ""; return;
}
if (file.size > 1024 * 1024) {
showMsg('profile-msg', "Image must be under 1MB.", "error");
return;
}
const reader = new FileReader();
reader.onload = async ev => {
const dataUrl = ev.target.result;
document.getElementById('settings-pfp-preview').innerHTML =
`<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
try {
await db.collection("users").doc(me.id).update({ photoURL: dataUrl });
document.getElementById('remove-pfp-btn').classList.remove('hidden');
showMsg('profile-msg', "Profile photo updated!", "success");
} catch (err) {
showMsg('profile-msg', "Failed to save photo.", "error");
}
};
reader.readAsDataURL(file);
e.target.value = "";
};
window.removePfp = async () => {
try {
await db.collection("users").doc(me.id).update({ photoURL: "" });
const prev = document.getElementById('settings-pfp-preview');
prev.innerHTML = "";
prev.textContent = (me.displayName || "?")[0].toUpperCase();
document.getElementById('remove-pfp-btn').classList.add('hidden');
showMsg('profile-msg', "Profile photo removed.", "success");
} catch (err) {
showMsg('profile-msg', "Failed to remove photo.", "error");
}
};
// ── Change password ───────────────────────────────────────────────────
window.handlePasswordChange = async () => {
clearMsg('pass-msg');
const oldP = document.getElementById('old-pass').value;
const newP = document.getElementById('new-pass').value;
const conP = document.getElementById('conf-pass').value;
if (!oldP || !newP || !conP) { showMsg('pass-msg', "Please fill in all three fields."); return; }
if (newP.length < 6) { showMsg('pass-msg', "New password must be at least 6 characters."); return; }
if (newP !== conP) { showMsg('pass-msg', "New passwords don't match."); return; }
try {
const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, oldP);
await auth.currentUser.reauthenticateWithCredential(cred);
await auth.currentUser.updatePassword(newP);
['old-pass', 'new-pass', 'conf-pass'].forEach(id => document.getElementById(id).value = "");
showMsg('pass-msg', "Password updated!", "success");
} catch (e) {
showMsg('pass-msg', friendlyAuthError(e.code));
}
};
// ── Change own email ──────────────────────────────────────────────────
window.openChangeEmailModal = () => {
['ce-new-email', 'ce-confirm-email', 'ce-password'].forEach(id => {
document.getElementById(id).value = '';
});
clearMsg('ce-msg');
const btn = document.getElementById('ce-btn');
btn.disabled = false;
btn.textContent = 'Send Verification Email';
openSubModal('change-email-modal');
};
window.confirmChangeEmail = async () => {
const newEmail = document.getElementById('ce-new-email').value.trim().toLowerCase();
const confirmEmail = document.getElementById('ce-confirm-email').value.trim().toLowerCase();
const password = document.getElementById('ce-password').value;
const btn = document.getElementById('ce-btn');
clearMsg('ce-msg');
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!newEmail) { showMsg('ce-msg', "Please enter a new email address."); return; }
if (!emailRegex.test(newEmail)) { showMsg('ce-msg', "Please enter a valid email address."); return; }
if (newEmail === auth.currentUser.email.toLowerCase()) { showMsg('ce-msg', "New email is the same as your current email."); return; }
if (newEmail !== confirmEmail) { showMsg('ce-msg', "Email addresses don't match."); return; }
if (!password) { showMsg('ce-msg', "Please enter your current password."); return; }
btn.disabled = true;
btn.textContent = 'Updating...';
try {
const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, password);
await auth.currentUser.reauthenticateWithCredential(cred);
await auth.currentUser.updateEmail(newEmail);
try {
await auth.currentUser.sendEmailVerification();
console.log('Verification email sent for email change');
} catch (verifyError) {
console.error('Failed to send verification email for email change:', verifyError);
showMsg('ce-msg', 'Email updated, but verification email failed. Check console.');
return;
}
await auth.signOut();
location.reload();
} catch (e) {
btn.disabled = false;
btn.textContent = 'Send Verification Email';
if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
showMsg('ce-msg', "Incorrect password. Please try again.");
} else if (e.code === 'auth/email-already-in-use') {
showMsg('ce-msg', "That email is already in use by another account.");
} else if (e.code === 'auth/invalid-email') {
showMsg('ce-msg', "Please enter a valid email address.");
} else if (e.code === 'auth/requires-recent-login') {
showMsg('ce-msg', "Session expired. Please log out and back in first.");
} else {
showMsg('ce-msg', "Failed to update email: " + (e.message || "Unknown error."));
}
}
};
// Enter key support for change email fields
['ce-new-email', 'ce-confirm-email', 'ce-password'].forEach(id => {
const el = document.getElementById(id);
if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') confirmChangeEmail(); });
});
// ── Deactivate own account ────────────────────────────────────────────
window.openDeactivateModal = () => {
document.getElementById('deactivate-confirm-pass').value = '';
document.getElementById('confirm-deactivate-msg').textContent = '';
document.getElementById('confirm-deactivate-msg').className = 'msg msg-error';
document.getElementById('confirm-deactivate-btn').disabled = false;
document.getElementById('confirm-deactivate-btn').textContent = 'Deactivate My Account';
openSubModal('confirm-deactivate-modal');
};
window.closeDeactivateModal = () => {
closeSubModal('confirm-deactivate-modal');
document.getElementById('deactivate-confirm-pass').value = '';
};
window.toggleDeactivatePassVis = () => {
const inp = document.getElementById('deactivate-confirm-pass');
inp.type = inp.type === 'password' ? 'text' : 'password';
};
window.confirmDeactivateAccount = async () => {
const password = document.getElementById('deactivate-confirm-pass').value;
const msgEl = document.getElementById('confirm-deactivate-msg');
const btn = document.getElementById('confirm-deactivate-btn');
msgEl.textContent = '';
msgEl.className = 'msg msg-error';
if (!password) {
msgEl.textContent = 'Please enter your password.';
msgEl.className = 'msg msg-error show';
return;
}
btn.disabled = true;
btn.textContent = 'Deactivating...';
try {
const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, password);
await auth.currentUser.reauthenticateWithCredential(cred);
await db.collection("users").doc(me.id).update({
deactivated: true,
rank: "Deactivated",
following: [],
followers: [],
blocked: [],
friends: [],
friendRequestsSent:[],
friendRequestsIn: []
});
await auth.signOut();
location.reload();
} catch (e) {
btn.disabled = false;
btn.textContent = 'Deactivate My Account';
msgEl.className = 'msg msg-error show';
if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
msgEl.textContent = 'Incorrect password. Please try again.';
} else if (e.code === 'auth/requires-recent-login') {
msgEl.textContent = 'Session expired. Please log out and back in first.';
} else {
msgEl.textContent = `Error: ${e.message}`;
}
}
};
// ── Login / Signup ────────────────────────────────────────────────────
let isSignup = false;
window.runAuth = async () => {
clearMsg('auth-msg');
const email = document.getElementById('auth-email').value.trim();
const pass = document.getElementById('auth-pass').value;
if (!email) { showMsg('auth-msg', "Please enter your email."); return; }
if (!pass) { showMsg('auth-msg', "Please enter your password."); return; }
const btn = document.getElementById('auth-btn');
btn.disabled = true;
btn.textContent = isSignup ? "Creating account..." : "Logging in...";
try {
if (isSignup) {
const r = await auth.createUserWithEmailAndPassword(email, pass);
await db.collection("users").doc(r.user.uid).set({
displayName: email.split('@')[0],
rank: isBootstrap(r.user.uid) ? "Admin" : "User",
verified: isBootstrap(r.user.uid),
bio: "",
photoURL: "",
followers: [],
following: [],
blocked: [],
friends: [],
friendRequestsSent:[],
friendRequestsIn: [],
createdAt: firebase.firestore.FieldValue.serverTimestamp()
});
try {
await r.user.sendEmailVerification();
console.log('Verification email sent successfully');
} catch (verifyError) {
console.error('Failed to send verification email:', verifyError);
showMsg('auth-msg', 'Account created, but verification email failed to send. Check console for details.', 'error');
return;
}
showMsg('auth-msg',
`✅ Account created! Verification email sent to ${email}. Please verify before posting.`,
"success"
);
isSignup = false;
document.getElementById('auth-title').textContent = "Login";
document.getElementById('auth-btn').textContent = "Login";
} else {
const r = await auth.signInWithEmailAndPassword(email, pass);
const snap = await db.collection("users").doc(r.user.uid).get();
if (snap.exists && !isAdminUID(r.user.uid)) {
const data = snap.data();
if (data.deactivated) {
await auth.signOut();
showMsg('auth-msg', "This account has been deactivated.");
return;
}
if (data.rank === "Banned") {
if (data.bannedUntil) {
const until = data.bannedUntil.toDate
? data.bannedUntil.toDate()
: new Date(data.bannedUntil);
if (new Date() >= until) {
await db.collection("users").doc(r.user.uid).update({
rank: "User",
bannedUntil: firebase.firestore.FieldValue.delete()
});
} else {
await auth.signOut();
const mins = Math.ceil((until - new Date()) / 60000);
const tl = mins < 60
? `${mins} minute${mins !== 1 ? 's' : ''}`
: `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) !== 1 ? 's' : ''}`;
showMsg('auth-msg', `Your account is banned for another ${tl}.`);
return;
}
} else {
await auth.signOut();
showMsg('auth-msg', "Your account has been permanently banned.");
return;
}
}
}
closeAll();
}
} catch (e) {
showMsg('auth-msg', friendlyAuthError(e.code));
} finally {
btn.disabled = false;
btn.textContent = isSignup ? "Sign Up" : "Login";
}
};
window.toggleAuthMode = () => {
isSignup = !isSignup;
clearMsg('auth-msg');
document.getElementById('auth-title').textContent = isSignup ? "Sign Up" : "Login";
document.getElementById('auth-btn').textContent = isSignup ? "Sign Up" : "Login";
document.getElementById('auth-toggle-text').textContent = isSignup
? "Already have an account? Login"
: "Don't have an account? Sign Up";
document.getElementById('forgot-link').style.display = isSignup ? "none" : "block";
};
window.sendPasswordReset = async () => {
const email = document.getElementById('auth-email').value.trim();
if (!email) { showMsg('auth-msg', "Enter your email address above first."); return; }
try {
await auth.sendPasswordResetEmail(email);
showMsg('auth-msg', `✅ Password reset email sent to ${email}. Check your inbox.`, "success");
} catch (e) {
if (e.code === 'auth/user-not-found') showMsg('auth-msg', "No account found with that email.");
else if (e.code === 'auth/invalid-email') showMsg('auth-msg', "Please enter a valid email address.");
else showMsg('auth-msg', "Failed to send reset email.");
}
};
// Enter key on login fields
['auth-email', 'auth-pass'].forEach(id => {
document.getElementById(id).addEventListener('keydown', e => {
if (e.key === "Enter") runAuth();
});
});
// ── Resend email verification ─────────────────────────────────────────
window.resendVerification = async () => {
const btn = document.getElementById('resend-verify-btn');
btn.disabled = true;
btn.textContent = "Sending...";
try {
await auth.currentUser.sendEmailVerification();
console.log('Resend verification email sent successfully');
btn.textContent = "Sent ✓";
setTimeout(() => { btn.disabled = false; btn.textContent = "Resend Email"; }, 30000);
} catch (e) {
console.error('Failed to resend verification email:', e);
btn.textContent = "Try again later";
setTimeout(() => { btn.disabled = false; btn.textContent = "Resend Email"; }, 5000);
}
};
// ── Admin panel ───────────────────────────────────────────────────────
window.openAdminModal = () => {
document.getElementById('admin-search').value = "";
renderAdminList();
openModal('admin-modal');
};
function renderAdminList() {
const list = document.getElementById('admin-user-list');
list.innerHTML = "";
Object.keys(allUsers).forEach(uid => list.appendChild(buildAdminRow(uid)));
filterAdminUsers();
}
function buildAdminRow(uid) {
const u = allUsers[uid];
const row = document.createElement('div');
row.className = "admin-row";
row.dataset.uid = uid;
row.dataset.name = (u.displayName || "").toLowerCase();
// Top: name + status badges
const top = document.createElement('div');
top.className = "admin-row-top";
const nm = document.createElement('span');
nm.style.cssText = "font-weight:700; font-size:0.9rem; flex:1;";
nm.textContent = u.displayName || "Unknown";
top.appendChild(nm);
if (u.verified) {
const vb = document.createElement('span');
vb.className = "badge badge-verified";
vb.textContent = "✔ Verified";
top.appendChild(vb);
}
if (u.rank === "Admin") {
const ab = document.createElement('span');
ab.className = "badge badge-admin";
ab.textContent = "Admin";
top.appendChild(ab);
}
if (u.deactivated) {
const db2 = document.createElement('span');
db2.className = "badge badge-banned";
db2.textContent = "Deactivated";
top.appendChild(db2);
}
if (u.rank && !SYSTEM_RANKS.includes(u.rank)) {
const crb = document.createElement('span');
crb.className = "badge badge-custom";
crb.textContent = u.rank;
top.appendChild(crb);
}
if (u.pendingEmail) {
const peb = document.createElement('span');
peb.className = "badge";
peb.style.cssText = "background:rgba(251,191,36,0.15); color:#fbbf24; border-color:#fbbf24;";
peb.title = `Pending: ${u.pendingEmail}`;
peb.textContent = "Email pending";
top.appendChild(peb);
}
if (u.rank === "Banned") {
const bb = document.createElement('span');
bb.className = "badge badge-banned";
if (u.bannedUntil) {
const until = u.bannedUntil.toDate ? u.bannedUntil.toDate() : new Date(u.bannedUntil);
const mins = Math.ceil((until - new Date()) / 60000);
bb.textContent = mins > 0
? `Banned (${mins < 60 ? mins + 'm' : Math.ceil(mins / 60) + 'h'})`
: "Banned";
} else {
bb.textContent = "Banned";
}
top.appendChild(bb);
}
row.appendChild(top);
// UID (click to copy)
const uidEl = document.createElement('code');
uidEl.className = "admin-row-uid";
uidEl.title = "Click to copy UID";
uidEl.textContent = uid;
uidEl.onclick = () => {
navigator.clipboard.writeText(uid).then(() => {
uidEl.textContent = "✔ Copied!";
uidEl.style.color = "var(--success)";
setTimeout(() => {
uidEl.textContent = uid;
uidEl.style.color = "";
}, 1800);
});
};
row.appendChild(uidEl);
// Action buttons
const btns = document.createElement('div');
btns.className = "admin-row-btns";
// Verify / Unverify
const vBtn = document.createElement('button');
vBtn.className = "btn-sm";
vBtn.textContent = u.verified ? "Unverify" : "Verify";
vBtn.onclick = () => adminAction(uid, { verified: !u.verified }, vBtn, u.verified ? "Unverified" : "Verified ✔");
btns.appendChild(vBtn);
if (uid !== me?.id) {
// Make / Remove Admin
const aBtn = document.createElement('button');
aBtn.className = "btn-sm btn-admin";
aBtn.textContent = u.rank === "Admin" ? "Remove Admin" : "Make Admin";
aBtn.onclick = () => adminAction(uid,
{ rank: u.rank === "Admin" ? "User" : "Admin" },
aBtn,
u.rank === "Admin" ? "Demoted" : "Promoted ✔"
);
btns.appendChild(aBtn);
// Set custom rank (purple button)
const crBtn = document.createElement('button');
crBtn.className = "btn-sm";
crBtn.style.cssText = "background:rgba(168,85,247,0.2); color:#c084fc; border:1px solid #c084fc;";
crBtn.textContent = "Set Rank";
crBtn.onclick = () => showCustomRankDialog(uid, u.displayName, u.rank || "User");
btns.appendChild(crBtn);
// Ban / Unban
const isBanned = u.rank === "Banned";
const bBtn = document.createElement('button');
bBtn.className = "btn-sm btn-danger";
if (isBanned) {
let lbl = "Unban";
if (u.bannedUntil) {
const until = u.bannedUntil.toDate ? u.bannedUntil.toDate() : new Date(u.bannedUntil);
const mins = Math.ceil((until - new Date()) / 60000);
if (mins > 0) lbl = `Unban (${mins < 60 ? mins + 'm' : Math.ceil(mins / 60) + 'h'} left)`;
}
bBtn.textContent = lbl;
bBtn.onclick = () => adminAction(uid,
{ rank: "User", bannedUntil: firebase.firestore.FieldValue.delete() },
bBtn, "Unbanned"
);
} else {
bBtn.textContent = "Ban";
bBtn.onclick = async () => {
const choice = await showBanDialog(u.displayName);
if (!choice) return;
const upd = { rank: "Banned", verified: false };
if (choice !== "permanent") {
upd.bannedUntil = firebase.firestore.Timestamp.fromDate(
new Date(Date.now() + choice * 60000)
);
}
await adminAction(uid, upd, bBtn, "Banned");
};
}
btns.appendChild(bBtn);
// Deactivate / Reactivate (protected from bootstrap admin)
if (!isAdminUID(uid)) {
const dBtn = document.createElement('button');
dBtn.className = "btn-sm btn-danger";
dBtn.style.opacity = "0.7";
if (u.deactivated) {
dBtn.textContent = "Reactivate";
dBtn.style.background = "var(--success)";
dBtn.style.color = "#0f172a";
dBtn.onclick = () => adminAction(uid, { deactivated: false, rank: "User" }, dBtn, "Reactivated");
} else {
dBtn.textContent = "Deactivate";
dBtn.onclick = () => adminDeactivate(uid, u.displayName, dBtn);
}
btns.appendChild(dBtn);
}
// Wipe all posts
const wipeBtn = document.createElement('button');
wipeBtn.className = "btn-sm btn-danger";
wipeBtn.style.opacity = "0.7";
wipeBtn.textContent = "Wipe Posts";
wipeBtn.onclick = () => adminWipePosts(uid, u.displayName, wipeBtn);
btns.appendChild(wipeBtn);
// Change Email / Cancel Email Change
const emailBtn = document.createElement('button');
emailBtn.className = "btn-sm btn-ghost";
if (u.pendingEmail) {
emailBtn.textContent = "Cancel Email Change";
emailBtn.style.cssText = "border-color:var(--danger); color:var(--danger);";
emailBtn.title = `Pending: ${u.pendingEmail}`;
emailBtn.onclick = async () => {
if (!confirm(`Cancel the pending email change for ${u.displayName}?`)) return;
emailBtn.disabled = true;
emailBtn.textContent = "Cancelling...";
try {
await db.collection("users").doc(uid).update({
pendingEmail: firebase.firestore.FieldValue.delete(),
verified: true
});
allUsers[uid] = { ...allUsers[uid], pendingEmail: undefined, verified: true };
renderAdminList();
} catch (e) {
emailBtn.disabled = false;
emailBtn.textContent = "Cancel Email Change";
alert("Failed: " + e.message);
}
};
} else {
emailBtn.textContent = "Change Email";
emailBtn.onclick = () => showChangeEmailDialog(uid, u.displayName);
}
btns.appendChild(emailBtn);
}
row.appendChild(btns);
return row;
}
// ── Custom rank dialog ────────────────────────────────────────────────
function showCustomRankDialog(uid, displayName, currentRank) {
document.getElementById('rank-dialog')?.remove();
const overlay = document.createElement('div');
overlay.id = "rank-dialog";
overlay.className = "rank-overlay";
overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
const box = document.createElement('div');
box.className = "rank-box";
const title = document.createElement('h3');
title.textContent = "Set Rank";
box.appendChild(title);
const desc = document.createElement('p');
desc.innerHTML = `Custom rank badge for <strong>${displayName}</strong>. Shows as a coloured badge on their posts and profile.`;
box.appendChild(desc);
const inp = document.createElement('input');
inp.type = "text";
inp.maxLength = 20;
inp.placeholder = "Enter rank name...";
inp.value = !SYSTEM_RANKS.includes(currentRank) ? currentRank : "";
inp.style.margin = "0 0 10px";
box.appendChild(inp);
const presetsLabel = document.createElement('p');
presetsLabel.style.cssText = "font-size:0.75rem; color:var(--muted); margin:0 0 8px;";
presetsLabel.textContent = "Quick presets:";
box.appendChild(presetsLabel);
const presetsWrap = document.createElement('div');
presetsWrap.className = "rank-presets";
["Moderator", "VIP", "Trusted", "Helper", "Founder", "Bot", "Staff"].forEach(p => {
const btn = document.createElement('span');
btn.className = "rank-preset";
btn.textContent = p;
btn.onclick = () => inp.value = p;
presetsWrap.appendChild(btn);
});
const clearPreset = document.createElement('span');
clearPreset.className = "rank-preset clear";
clearPreset.textContent = "✕ Clear rank";
clearPreset.onclick = () => inp.value = "";
presetsWrap.appendChild(clearPreset);
box.appendChild(presetsWrap);
const btnRow = document.createElement('div');
btnRow.className = "rank-dialog-btns";
const applyBtn = document.createElement('button');
applyBtn.textContent = "Apply Rank";
const cancelBtn = document.createElement('button');
cancelBtn.className = "btn-ghost";
cancelBtn.textContent = "Cancel";
cancelBtn.onclick = () => overlay.remove();
btnRow.appendChild(applyBtn);
btnRow.appendChild(cancelBtn);
box.appendChild(btnRow);
overlay.appendChild(box);
document.body.appendChild(overlay);
setTimeout(() => inp.focus(), 50);
inp.addEventListener('keydown', e => { if (e.key === 'Enter') applyRank(); });
applyBtn.onclick = applyRank;
async function applyRank() {
let newRank = inp.value.trim();
if (newRank && containsProfanity(newRank)) {
inp.style.borderColor = "var(--danger)";
inp.placeholder = "⚠ Inappropriate rank name";
setTimeout(() => { inp.style.borderColor = ""; inp.placeholder = "Enter rank name..."; }, 2000);
return;
}
if (!newRank) newRank = "User";
applyBtn.disabled = true;
applyBtn.textContent = "Saving...";
try {
await db.collection("users").doc(uid).update({ rank: newRank });
allUsers[uid] = { ...allUsers[uid], rank: newRank };
overlay.remove();
renderAdminList();
renderFeed();
} catch (e) {
applyBtn.disabled = false;
applyBtn.textContent = "Apply Rank";
inp.style.borderColor = "var(--danger)";
inp.placeholder = "Failed — check Firestore rules";
setTimeout(() => { inp.style.borderColor = ""; inp.placeholder = "Enter rank name..."; }, 3000);
}
}
}
// ── Admin: change email dialog ────────────────────────────────────────
function showChangeEmailDialog(uid, displayName) {
document.getElementById('email-change-dialog')?.remove();
const overlay = document.createElement('div');
overlay.id = "email-change-dialog";
overlay.className = "rank-overlay";
overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
const box = document.createElement('div');
box.className = "rank-box";
const title = document.createElement('h3');
title.textContent = "Change Email";
box.appendChild(title);
const desc = document.createElement('p');
desc.innerHTML = `Set a new email address for <strong>${displayName}</strong>. A verification email will be sent to the new address.`;
box.appendChild(desc);
const emailLabel = document.createElement('p');
emailLabel.style.cssText = "font-size:0.8rem; color:var(--muted); margin:0 0 4px;";
emailLabel.textContent = "New email address";
box.appendChild(emailLabel);
const emailInp = document.createElement('input');
emailInp.type = "email";
emailInp.placeholder = "newaddress@example.com";
emailInp.style.margin = "0 0 10px";
box.appendChild(emailInp);
const confirmLabel = document.createElement('p');
confirmLabel.style.cssText = "font-size:0.8rem; color:var(--muted); margin:0 0 4px;";
confirmLabel.textContent = "Confirm new email";
box.appendChild(confirmLabel);
const confirmInp = document.createElement('input');
confirmInp.type = "email";
confirmInp.placeholder = "Confirm email address";
confirmInp.style.margin = "0 0 14px";
box.appendChild(confirmInp);
const errMsg = document.createElement('p');
errMsg.style.cssText = [
"font-size:0.82rem", "color:#fca5a5",
"background:rgba(239,68,68,0.12)", "border:1px solid rgba(239,68,68,0.3)",
"border-radius:8px", "padding:8px 12px", "margin:0 0 12px", "display:none"
].join(';');
box.appendChild(errMsg);
const btnRow = document.createElement('div');
btnRow.className = "rank-dialog-btns";
const applyBtn = document.createElement('button');
applyBtn.textContent = "Save Email";
const cancelBtn = document.createElement('button');
cancelBtn.className = "btn-ghost";
cancelBtn.textContent = "Cancel";
cancelBtn.onclick = () => overlay.remove();
btnRow.appendChild(applyBtn);
btnRow.appendChild(cancelBtn);
box.appendChild(btnRow);
overlay.appendChild(box);
document.body.appendChild(overlay);
setTimeout(() => emailInp.focus(), 50);
confirmInp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
applyBtn.onclick = apply;
async function apply() {
const ne = emailInp.value.trim().toLowerCase();
const ce = confirmInp.value.trim().toLowerCase();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!ne) { showErr("Please enter a new email address."); return; }
if (!emailRegex.test(ne)) { showErr("Please enter a valid email address."); return; }
if (ne !== ce) { showErr("Email addresses don't match."); return; }
applyBtn.disabled = true;
applyBtn.textContent = "Saving...";
try {
await db.collection("users").doc(uid).update({ pendingEmail: ne, verified: false });
allUsers[uid] = { ...allUsers[uid], pendingEmail: ne, verified: false };
overlay.remove();
renderAdminList();
const toast = document.createElement('div');
toast.style.cssText = [
"position:fixed", "bottom:24px", "left:50%", "transform:translateX(-50%)",
"background:var(--card)", "border:1px solid var(--success)", "color:#86efac",
"padding:12px 20px", "border-radius:10px", "font-size:0.85rem",
"font-weight:600", "z-index:3000", "box-shadow:0 4px 20px rgba(0,0,0,0.5)"
].join(';');
toast.textContent = `New email saved for ${displayName}. They'll need to verify it on next login.`;
document.body.appendChild(toast);
setTimeout(() => toast.remove(), 4000);
} catch (e) {
applyBtn.disabled = false;
applyBtn.textContent = "Save Email";
showErr("Failed: " + e.message);
}
}
function showErr(msg) {
errMsg.textContent = msg;
errMsg.style.display = "block";
setTimeout(() => { errMsg.style.display = "none"; }, 4000);
}
}
// ── Admin: wipe all posts by user ─────────────────────────────────────
async function adminWipePosts(uid, displayName, btn) {
console.log('Admin wipe attempt by:', auth.currentUser ? auth.currentUser.uid : 'No user');
console.log('Is admin:', auth.currentUser ? isAdminUID(auth.currentUser.uid) : false);
console.log('Target UID:', uid);
const userPosts = allPosts.filter(p => p.authorUid === uid);
console.log('User posts to delete:', userPosts.length);
if (!userPosts.length) {
alert(`${displayName} has no posts to delete.`);
return;
}
if (!confirm(`Delete ALL ${userPosts.length} post${userPosts.length !== 1 ? 's' : ''} by ${displayName}?\n\nThis includes posts and replies. This cannot be undone.`)) return;
btn.disabled = true;
btn.textContent = "Wiping...";
try {
// Delete user's own posts / replies in batches of 400
for (let i = 0; i < userPosts.length; i += 400) {
const batch = db.batch();
userPosts.slice(i, i + 400).forEach(p => batch.delete(db.collection("posts").doc(p.id)));
console.log(`Deleting batch of ${userPosts.slice(i, i + 400).length} user posts`);
await batch.commit();
}
// Also delete orphan replies on their top-level posts
const topIds = new Set(userPosts.filter(p => !p.parentId).map(p => p.id));
const orphans = allPosts.filter(p => p.parentId && topIds.has(p.parentId) && p.authorUid !== uid);
for (let i = 0; i < orphans.length; i += 400) {
const batch = db.batch();
orphans.slice(i, i + 400).forEach(p => batch.delete(db.collection("posts").doc(p.id)));
console.log(`Deleting batch of ${orphans.slice(i, i + 400).length} orphan replies`);
await batch.commit();
}
btn.textContent = "Wiped ✔";
btn.style.background = "var(--success)";
btn.style.color = "#0f172a";
setTimeout(() => {
btn.disabled = false;
btn.textContent = "Wipe Posts";
btn.style.background = "";
btn.style.color = "";
renderAdminList();
}, 1500);
renderFeed();
} catch (e) {
console.error('Error during wipe:', e);
btn.disabled = false;
btn.textContent = "Delete Posts";
alert("Failed to wipe posts: " + e.message);
}
}
// ── Admin: deactivate account ─────────────────────────────────────────
async function adminDeactivate(uid, displayName, btn) {
if (isAdminUID(uid)) {
alert("The bootstrap admin account cannot be deactivated.");
return;
}
if (uid === me?.id) {
alert("You cannot deactivate your own account from the admin panel.");
return;
}
if (!confirm(`Deactivate ${displayName}'s account?\n\nTheir posts will remain visible but they will be locked out.`)) return;
btn.disabled = true;
btn.textContent = "Deactivating...";
try {
await db.collection("users").doc(uid).update({
deactivated: true,
rank: "Deactivated",
following: [],
followers: [],
blocked: [],
friends: [],
friendRequestsSent:[],
friendRequestsIn: []
});
allUsers[uid] = { ...allUsers[uid], deactivated: true, rank: "Deactivated" };
renderFeed();
renderAdminList();
} catch (e) {
btn.disabled = false;
btn.textContent = "Deactivate";
alert("Failed: " + e.message);
}
}
// ── Admin: ban duration dialog ────────────────────────────────────────
function showBanDialog(displayName) {
return new Promise(resolve => {
document.getElementById('ban-dialog')?.remove();
const overlay = document.createElement('div');
overlay.id = "ban-dialog";
overlay.style.cssText = [
"position:fixed", "inset:0",
"background:rgba(0,0,0,0.85)", "backdrop-filter:blur(8px)",
"z-index:2000", "display:flex", "align-items:center", "justify-content:center"
].join(';');
const box = document.createElement('div');
box.style.cssText = [
"background:rgba(22,27,42,0.97)", "border:1px solid rgba(255,255,255,0.1)",
"border-radius:14px", "padding:24px", "width:92%", "max-width:340px"
].join(';');
const durations = [
{ label: "⏱ 30 minutes", val: 30 },
{ label: "⏱ 1 hour", val: 60 },
{ label: "⏱ 6 hours", val: 360 },
{ label: "📅 1 day", val: 1440 },
{ label: "📅 7 days", val: 10080 },
{ label: "📅 30 days", val: 43200 },
];
box.innerHTML = `
<h3 style="margin:0 0 6px">Ban ${displayName}</h3>
<p style="color:var(--muted);font-size:.85rem;margin:0 0 16px">Select ban duration:</p>
<div style="display:flex;flex-direction:column;gap:8px" id="ban-options"></div>
`;
overlay.appendChild(box);
document.body.appendChild(overlay);
const optContainer = box.querySelector('#ban-options');
durations.forEach(({ label, val }) => {
const btn = document.createElement('button');
btn.textContent = label;
btn.style.cssText = "background:var(--bg); border:1px solid var(--border); color:var(--text); text-align:left; padding:10px 14px; border-radius:8px; font-weight:600; cursor:pointer;";
btn.onmouseenter = () => btn.style.borderColor = "var(--danger)";
btn.onmouseleave = () => btn.style.borderColor = "var(--border)";
btn.onclick = () => { overlay.remove(); resolve(val); };
optContainer.appendChild(btn);
});
// Permanent ban
const permBtn = document.createElement('button');
permBtn.textContent = "🚫 Permanent";
permBtn.style.cssText = "background:rgba(239,68,68,0.12); border:1px solid var(--danger); color:var(--danger); text-align:left; padding:10px 14px; border-radius:8px; font-weight:600; cursor:pointer;";
permBtn.onclick = () => { overlay.remove(); resolve("permanent"); };
optContainer.appendChild(permBtn);
// Cancel
const cancelBtn = document.createElement('button');
cancelBtn.textContent = "Cancel";
cancelBtn.style.cssText = "background:transparent; border:1px solid var(--border); color:var(--muted); padding:8px; border-radius:8px; font-weight:600; cursor:pointer; margin-top:2px;";
cancelBtn.onclick = () => { overlay.remove(); resolve(null); };
optContainer.appendChild(cancelBtn);
});
}
// ── Admin: generic field update ───────────────────────────────────────
async function adminAction(uid, update, btn, successLabel) {
btn.disabled = true;
btn.textContent = "...";
try {
await db.collection("users").doc(uid).update(update);
allUsers[uid] = { ...allUsers[uid], ...update };
btn.textContent = successLabel;
setTimeout(() => renderAdminList(), 900);
} catch (e) {
btn.textContent = "Failed";
btn.style.background = "var(--danger)";
btn.style.color = "white";
setTimeout(() => {
btn.disabled = false;
btn.textContent = "Retry";
btn.style.background = "";
btn.style.color = "";
}, 2000);
}
}
// ── Admin: search/filter ──────────────────────────────────────────────
window.filterAdminUsers = () => {
const q = document.getElementById('admin-search').value.toLowerCase().trim();
let count = 0;
document.querySelectorAll('.admin-row').forEach(row => {
const match = !q
|| row.dataset.name.includes(q)
|| row.dataset.uid.toLowerCase().includes(q);
row.style.display = match ? "" : "none";
if (match) count++;
});
document.getElementById('admin-no-results').style.display = count === 0 ? "block" : "none";
};
// ── Viewers modal ─────────────────────────────────────────────────────
window.openViewersModal = (postId, viewUids) => {
const list = document.getElementById('viewers-list');
list.innerHTML = "";
const valid = viewUids.filter(uid => allUsers[uid]);
if (!valid.length) {
list.innerHTML = '<div class="empty-tab">No views yet.</div>';
} else {
valid.forEach(uid => {
const u = allUsers[uid];
const row = document.createElement('div');
row.className = "follower-row";
row.appendChild(makeSmallAvatar(u));
const nm = document.createElement('span');
nm.className = "follower-name";
nm.textContent = u.displayName;
row.appendChild(nm);
row.onclick = () => { closeModal('viewers-modal'); openProfile(uid); };
list.appendChild(row);
});
}
openModal('viewers-modal');
};
