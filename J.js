firebase.initializeApp({
    apiKey:            "AIzaSyDodYMJK-05UhWw1io4b-WYkn1mpWmZrVY",
    authDomain:        "fourm-497aa.firebaseapp.com",
    projectId:         "fourm-497aa",
    storageBucket:     "fourm-497aa.firebasestorage.app",
    messagingSenderId: "188261891425",
    appId:             "1:188261891425:web:b9cbfd0fea5d0bbeeed920"
});

const db   = firebase.firestore();
const auth = firebase.auth();

const CLOUDINARY_CLOUD_NAME   = "dshqexmz3";
const CLOUDINARY_UPLOAD_PRESET = "ForumM";

const ADMIN_UID = "fenJvZ3YoVUAL7kXKbTsdiUmom22";

const BOOTSTRAP_ADMIN = ADMIN_UID;
const isAdminUID      = uid => uid === ADMIN_UID;
const isBootstrap     = uid => uid === BOOTSTRAP_ADMIN;

const SYSTEM_RANKS = ["Admin", "User", "Banned", "Deactivated", ""];

let me               = null;
let allUsers         = {};
let allPosts         = [];
let usersReady       = false;
let postsReady       = false;
let currentProfileUid = null;
let currentFeedTab   = 'all';
let lastPostTime     = 0;
const expandedPosts  = new Set();

let postMedia = [];
const POSTS_PER_PAGE = 5;
let   feedPage       = 1;
let activeDMUid     = null;
let dmMessagesUnsub = null;
let replyMediaQueue = {};

window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === 'string' && message.includes('ResizeObserver')) return true;
    console.error('Unhandled JS error:', message, source, lineno, colno, error);
    return false;
};


(function initQuickPost() {
    const observer = new IntersectionObserver(entries => {
        const fab     = document.getElementById('quick-post-fab');
        const popup   = document.getElementById('quick-post-popup');
        const creator = document.getElementById('post-creator');
        if (!fab) return;
        const isVisible = entries[0].isIntersecting;
        const canShow = me && !creator.classList.contains('hidden');
        if (isVisible) {
            fab.style.display = 'none';
            if (popup) popup.style.display = 'none';
        } else if (canShow) {
            fab.style.display = 'flex';
        }
    }, { threshold: 0.1 });

    document.addEventListener('DOMContentLoaded', () => {
        const creator = document.getElementById('post-creator');
        if (creator) observer.observe(creator);
    });

    window._refreshQuickPostFab = function() {
        const creator = document.getElementById('post-creator');
        const fab     = document.getElementById('quick-post-fab');
        if (!fab || !creator) return;
        if (creator.classList.contains('hidden')) {
            fab.style.display = 'none';
        }
        observer.unobserve(creator);
        observer.observe(creator);
    };
})();

window.openQuickPost = function() {
    const popup = document.getElementById('quick-post-popup');
    if (!popup) return;
    popup.style.display = 'block';
    const fab = document.getElementById('quick-post-fab');
    if (fab) fab.style.display = 'none';
    setTimeout(() => {
        const ta = document.getElementById('quick-post-body');
        if (ta) ta.focus();
    }, 60);
};

window.closeQuickPost = function() {
    const popup = document.getElementById('quick-post-popup');
    if (popup) popup.style.display = 'none';
    const creator = document.getElementById('post-creator');
    const fab     = document.getElementById('quick-post-fab');
    if (!fab || !creator) return;
    const rect = creator.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inView && me && !creator.classList.contains('hidden')) {
        fab.style.display = 'flex';
    }
};

window.submitQuickPost = async function() {
    const ta = document.getElementById('quick-post-body');
    if (!ta) return;
    const mainBody = document.getElementById('post-body');
    if (!mainBody) return;
    const originalValue = mainBody.value;
    mainBody.value = ta.value;
    await submitPost();
    if (!mainBody.value) {
        ta.value = '';
        closeQuickPost();
    } else {
        mainBody.value = originalValue;
    }
};

window.handleQuickPostMedia = function(input) {
    handlePostMedia(input);
};


window.togglePassVis = function(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const nowVisible = inp.type === 'password';
    inp.type = nowVisible ? 'text' : 'password';
    btn.style.opacity = nowVisible ? '1' : '0.4';
};

async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file',          file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        { method: 'POST', body: formData }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Upload failed (${response.status})`);
    }

    const data = await response.json();
    return data.secure_url;
}

function rankBadgeClass(rank) {
    if (rank === "Admin")                            return "badge-admin";
    if (rank === "Banned" || rank === "Deactivated") return "badge-banned";
    if (!rank || rank === "User")                    return "badge-rank";
    return "badge-custom";
}

window.openModal = id => {
    document.getElementById(id).style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
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
    document.body.style.overflow = '';
    currentProfileUid = null;
};

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

function friendlyAuthError(code) {
    const map = {
        "auth/wrong-password":         "Incorrect password.",
        "auth/invalid-credential":     "Incorrect email or password.",
        "auth/user-not-found":         "No account with that email.",
        "auth/email-already-in-use":   "An account with this email already exists.",
        "auth/weak-password":          "Password must be at least 6 characters.",
        "auth/invalid-email":          "Please enter a valid email address.",
        "auth/too-many-requests":      "Too many attempts. Please wait and try again.",
        "auth/network-request-failed": "Network error. Check your connection.",
        "auth/requires-recent-login":  "Please log out and log back in first.",
    };
    return map[code] || "Something went wrong. Please try again.";
}

function showMsg(id, text, type = "error") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className   = `msg msg-${type} show`;
}

function clearMsg(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className   = "msg msg-error";
    el.textContent = "";
}

function renderAvatarEl(el, user) {
    if (!el) return;
    if (user && user.photoURL) {
        el.innerHTML = `<img src="${user.photoURL}" alt="">`;
    } else {
        el.innerHTML  = "";
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

function formatAccountAge(createdAt) {
    if (!createdAt) return "Unknown";
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60)         return `${diff} second${diff !== 1 ? 's' : ''} old`;
    if (diff < 3600)       return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} old`;
    if (diff < 86400)      return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} old`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} old`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} month${Math.floor(diff / (86400 * 30)) !== 1 ? 's' : ''} old`;
    return `${Math.floor(diff / (86400 * 365))} year${Math.floor(diff / (86400 * 365)) !== 1 ? 's' : ''} old`;
}

function accountOlderThan(createdAt, seconds) {
    if (!createdAt) return false;
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return (new Date() - date) / 1000 > seconds;
}

const HARD_BLOCKED_WORDS = [
    "nigger", "nigga", "kike", "spic", "chink", "wetback",
    "faggot", "tranny", "nonce", "cock", "rape", "pussy",
    "rapist", "nazi", "hitler"
];

function containsProfanity(text) {
    const stripped = text.toLowerCase().replace(/[^a-z]/g, '');
    return HARD_BLOCKED_WORDS.some(w => stripped.includes(w.replace(/[^a-z]/g, '')));
}



  function _buildDialogOverlay() {
      document.getElementById('_dialog-overlay')?.remove();
      const ov = document.createElement('div');
      ov.id = '_dialog-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:#00000080;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#161b2ab2;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:1px solid #ffffff14;border-radius:18px;padding:26px;width:92%;max-width:400px;box-shadow:0 8px 60px #0009;';
      ov.appendChild(box);
      document.body.appendChild(ov);
      return { ov, box };
  }

  function showAlert(msg, title) {
      return new Promise(resolve => {
          const { ov, box } = _buildDialogOverlay();
          if (title) {
              const h = document.createElement('h3');
              h.style.cssText = 'margin:0 0 12px;font-size:1rem;color:var(--text);';
              h.textContent = title;
              box.appendChild(h);
          }
          const p = document.createElement('p');
          p.style.cssText = 'margin:0 0 20px;font-size:0.88rem;color:var(--text);line-height:1.6;white-space:pre-wrap;';
          p.textContent = msg;
          box.appendChild(p);
          const btn = document.createElement('button');
          btn.textContent = 'OK';
          btn.style.cssText = 'width:100%;padding:10px;border-radius:8px;';
          btn.onclick = () => { ov.remove(); resolve(); };
          box.appendChild(btn);
          setTimeout(() => btn.focus(), 40);
          ov.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { ov.remove(); resolve(); } });
      });
  }

  function showConfirm(msg, title) {
      return new Promise(resolve => {
          const { ov, box } = _buildDialogOverlay();
          if (title) {
              const h = document.createElement('h3');
              h.style.cssText = 'margin:0 0 12px;font-size:1rem;color:var(--text);';
              h.textContent = title;
              box.appendChild(h);
          }
          const p = document.createElement('p');
          p.style.cssText = 'margin:0 0 20px;font-size:0.88rem;color:var(--text);line-height:1.6;white-space:pre-wrap;';
          p.textContent = msg;
          box.appendChild(p);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:10px;';
          const ok = document.createElement('button');
          ok.textContent = 'Confirm';
          ok.style.cssText = 'flex:1;padding:10px;border-radius:8px;background:var(--danger);color:#fff;border:none;font-weight:700;cursor:pointer;';
          ok.onclick = () => { ov.remove(); resolve(true); };
          const cancel = document.createElement('button');
          cancel.textContent = 'Cancel';
          cancel.style.cssText = 'flex:1;padding:10px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--text);font-weight:600;cursor:pointer;';
          cancel.onclick = () => { ov.remove(); resolve(false); };
          row.appendChild(ok); row.appendChild(cancel);
          box.appendChild(row);
          setTimeout(() => cancel.focus(), 40);
          ov.addEventListener('keydown', e => { if (e.key === 'Escape') { ov.remove(); resolve(false); } });
      });
  }

  function showPrompt(msg, defaultVal) {
      return new Promise(resolve => {
          const { ov, box } = _buildDialogOverlay();
          const p = document.createElement('p');
          p.style.cssText = 'margin:0 0 12px;font-size:0.88rem;color:var(--text);line-height:1.6;white-space:pre-wrap;';
          p.textContent = msg;
          box.appendChild(p);
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = defaultVal || '';
          inp.style.cssText = 'width:100%;margin:0 0 14px;';
          box.appendChild(inp);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:10px;';
          const ok = document.createElement('button');
          ok.textContent = 'OK';
          ok.style.cssText = 'flex:1;padding:10px;border-radius:8px;';
          ok.onclick = () => { ov.remove(); resolve(inp.value || null); };
          const cancel = document.createElement('button');
          cancel.textContent = 'Cancel';
          cancel.style.cssText = 'flex:1;padding:10px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--text);font-weight:600;cursor:pointer;';
          cancel.onclick = () => { ov.remove(); resolve(null); };
          row.appendChild(ok); row.appendChild(cancel);
          box.appendChild(row);
          setTimeout(() => inp.focus(), 40);
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.onclick(); if (e.key === 'Escape') { ov.remove(); resolve(null); } });
      });
  }
  


function renderMediaPreviews() {
    const preview = document.getElementById('post-media-preview');
    if (!preview) return;

    preview.innerHTML = '';

    if (postMedia.length === 0) {
        preview.style.display = 'none';
        return;
    }

    preview.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px;";

    postMedia.forEach((media, index) => {
        const isVideo = media.mimeType.startsWith('video/');
        const container = document.createElement('div');
        container.style.cssText = isVideo
            ? "position:relative; display:inline-block; width:120px; height:70px;"
            : "position:relative; display:inline-block; width:70px; height:70px;";

        if (isVideo) {
            const vid = document.createElement('video');
            vid.src           = media.localUrl;
            vid.muted         = true;
            vid.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid var(--primary);";
            const playIcon = document.createElement('div');
            playIcon.textContent  = "▶";
            playIcon.style.cssText = [
                "position:absolute", "top:50%", "left:50%",
                "transform:translate(-50%,-50%)",
                "color:white", "font-size:1.2rem",
                "text-shadow:0 0 6px rgba(0,0,0,0.8)",
                "pointer-events:none"
            ].join(';');
            container.appendChild(vid);
            container.appendChild(playIcon);
        } else {
            const img = document.createElement('img');
            img.src           = media.localUrl;
            img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid var(--primary);";
            container.appendChild(img);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type      = "button";
        removeBtn.innerHTML = "&times;";
        removeBtn.className = "remove-media-btn";
        removeBtn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            URL.revokeObjectURL(media.localUrl);
            postMedia.splice(index, 1);
            renderMediaPreviews();
        };
        container.appendChild(removeBtn);
        preview.appendChild(container);
    });
}
window.handlePostMedia = input => {
    const files = Array.from(input.files);

    for (const file of files) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
            showAlert(`"${file.name}" is not a supported file type. Please use images or videos.`);
            input.value = '';
            return;
        }

        if (isVideo && postMedia.some(m => m.mimeType.startsWith('video/'))) {
            showAlert('Only one video is allowed per post.');
            input.value = '';
            return;
        }

        if (isVideo && postMedia.some(m => m.mimeType.startsWith('image/'))) {
            showAlert('You cannot add Videos with Images, It\'s one or the other. (Data aint cheap!)');
            input.value = '';
            return;
        }

        if (isImage && postMedia.some(m => m.mimeType.startsWith('video/'))) {
            showAlert('You cannot add Images with Videos, It\'s one or the other. (Data aint cheap!)');
            input.value = '';
            return;
        }

        if (isImage && postMedia.length >= 4) {
            showAlert('You can only attach up to 4 images per post.');
            input.value = '';
            return;
        }

        const localUrl = URL.createObjectURL(file);
        if (isVideo) {
            const tv = document.createElement('video');
            tv.preload = 'metadata'; tv.src = localUrl;
            tv.onloadedmetadata = () => {
                if (tv.duration > 60) {
                    URL.revokeObjectURL(localUrl);
                    showAlert('"' + file.name + '" is ' + Math.round(tv.duration) + 's. Videos must be 60 seconds or shorter.');
                } else {
                    postMedia.push({ file, mimeType: file.type, localUrl });
                    renderMediaPreviews();
                }
            };
            tv.onerror = () => { URL.revokeObjectURL(localUrl); showAlert('Could not read "' + file.name + '".'); };
        } else {
            postMedia.push({ file, mimeType: file.type, localUrl });
            renderMediaPreviews();
        }
    }
    input.value = '';
};

window.removePostMedia = () => {
    postMedia.forEach(m => URL.revokeObjectURL(m.localUrl));
    postMedia = [];
    renderMediaPreviews();
};


auth.onAuthStateChanged(async user => {
    if (!user) {
        document.getElementById('login-btn').classList.remove('hidden');
        document.getElementById('nav-auth-controls').style.display = 'none';
        document.getElementById('post-creator').classList.add('hidden');
        document.getElementById('feed-tabs').classList.add('hidden');
        if (window._refreshQuickPostFab) window._refreshQuickPostFab();
        const vb = document.getElementById('verify-banner');
        if (vb) { vb.classList.add('hidden'); vb.style.display = ''; }
        me = null;
        return;
    }

    const ref  = db.collection("users").doc(user.uid);
    const snap = await ref.get();

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
                    const tl   = mins < 60
                        ? `${mins} minute${mins !== 1 ? 's' : ''}`
                        : `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) !== 1 ? 's' : ''}`;
                    const r1 = d.banReason ? ` Reason: ${d.banReason}.` : '';
                    showMsg('auth-msg', `Your account is banned for ${tl}.${r1} If you think this was a mistake, Email (catylastfourms@gmail.com)`);
                    openModal('auth-modal');
                    return;
                }
                await ref.update({ rank: "User", bannedUntil: firebase.firestore.FieldValue.delete(), banReason: firebase.firestore.FieldValue.delete() });
            } else {
                await auth.signOut();
                const rp1 = d.banReason ? ` Reason: ${d.banReason}.` : '';
                showMsg('auth-msg', `Your account has been permanently banned.${rp1} If you think this was a mistake, Email (catylastfourms@gmail.com)`);
                openModal('auth-modal');
                return;
            }
        }
    }

    document.getElementById('login-btn').classList.add('hidden');
    document.getElementById('nav-auth-controls').style.display = 'flex';
    document.getElementById('feed-tabs').classList.remove('hidden');

    if (!snap.exists) {
        await ref.set({
            displayName:        user.email.split('@')[0],
            rank:               isAdminUID(user.uid) ? "Admin" : "User",
            verified:           isAdminUID(user.uid),
            bio:                "",
            photoURL:           "",
            followers:          [],
            following:          [],
            blocked:            [],
            friends:            [],
            friendRequestsSent: [],
            friendRequestsIn:   [],
            createdAt:          firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        const data = snap.data();
        const upd  = {};
        if (!Array.isArray(data.followers))          upd.followers          = [];
        if (!Array.isArray(data.following))          upd.following          = [];
        if (!Array.isArray(data.blocked))            upd.blocked            = [];
        if (!Array.isArray(data.friends))            upd.friends            = [];
        if (!Array.isArray(data.friendRequestsSent)) upd.friendRequestsSent = [];
        if (!Array.isArray(data.friendRequestsIn))   upd.friendRequestsIn   = [];
        if (typeof data.photoURL === 'undefined')    upd.photoURL           = "";
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

    ref.onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();

        if (data.rank === "Banned" && data.bannedUntil && !isAdminUID(user.uid)) {
            const until = data.bannedUntil.toDate
                ? data.bannedUntil.toDate()
                : new Date(data.bannedUntil);
            if (new Date() >= until) {
                ref.update({ rank: "User", bannedUntil: firebase.firestore.FieldValue.delete(), banReason: firebase.firestore.FieldValue.delete() });
                return;
            }
            auth.signOut();
            location.reload();
            return;
        }

        if (data.rank === "Banned" && !isAdminUID(user.uid)) {
            auth.signOut();
            location.reload();
            return;
        }

        me = {
            id:   user.uid,
            ...data,
            rank: isAdminUID(user.uid) ? "Admin" : (data.rank || "User")
        };
        allUsers[user.uid] = { ...data, rank: me.rank };

        document.getElementById('admin-btn')
            .classList.toggle('hidden', !isAdminUID(user.uid) && me.rank !== "Admin");

        const reqCount = (me.friendRequestsIn || []).length;
        const ftbMain = document.getElementById('friends-tab-btn');
        if (ftbMain) {
            ftbMain.innerHTML = reqCount > 0
                ? 'Friends <span class="req-badge">' + reqCount + '</span>'
                : 'Friends';
        }
        const menuSettingsBadge = document.getElementById('menu-friend-badge');
        if (menuSettingsBadge) {
            menuSettingsBadge.textContent   = reqCount || '';
            menuSettingsBadge.style.display = reqCount ? 'inline-block' : 'none';
        }

        const canPost = user.emailVerified || isAdminUID(user.uid);
        document.getElementById('post-creator').classList.toggle('hidden', !canPost);

        const canAttachMedia = canPost && accountOlderThan(me.createdAt, 3600);
        const attachBtn = document.getElementById('attach-media-btn');
        if (attachBtn) attachBtn.style.display = canAttachMedia ? '' : 'none';

        const vb = document.getElementById('verify-banner');
        if (vb) {
            vb.classList.toggle('hidden', canPost);
            if (!canPost) vb.style.display = 'flex';
        }

        startDMBadgeListener(user.uid);
        startNotificationListener(user.uid);
        updateMenuUserRow();
        renderFeed();
    });
});


db.collection("users").onSnapshot({
    next: snap => {
        const fresh = {};
        snap.forEach(d => fresh[d.id] = d.data());
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
        allPosts   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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


window.switchFeedTab = tab => {
    currentFeedTab = tab;
    feedPage = 1;
    if (window._feedObserver) { window._feedObserver.disconnect(); window._feedObserver = null; }
    document.getElementById('ftab-all')      .classList.toggle('active', tab === 'all');
    document.getElementById('ftab-following').classList.toggle('active', tab === 'following');
    document.getElementById('ftab-friends')  .classList.toggle('active', tab === 'friends');
    renderFeed();
};

function renderFeed() {
    const feed = document.getElementById('main-feed');
    feed.innerHTML = "";

    const blocked = me ? (me.blocked || []) : [];
    let roots = allPosts.filter(p => {
        if (p.parentId) return false;
        const u = allUsers[p.authorUid];
        if (!u) return false;
        if (blocked.includes(p.authorUid)) return false;
        if (u.rank === 'Banned' || u.deactivated === true) return false;
        return true;
    });

    if (currentFeedTab === 'following' && me) {
        const following = me.following || [];
        roots = roots.filter(p => following.includes(p.authorUid));
    }

    if (currentFeedTab === 'friends' && me) {
        const friends = me.friends || [];
        roots = roots.filter(p => friends.includes(p.authorUid));
    }

    if (!roots.length) {
        let msg = "No posts yet!";
        if (currentFeedTab === 'following') msg = "No posts from people you follow yet.";
        if (currentFeedTab === 'friends')   msg = "No posts from any friends yet.";
        feed.innerHTML = `<p id="feed-empty">${msg}</p>`;
        return;
    }

    const visible = roots.slice(0, POSTS_PER_PAGE * feedPage);
    visible.forEach(p => feed.appendChild(buildPost(p, 0)));
    if (window._feedObserver) { window._feedObserver.disconnect(); window._feedObserver = null; }
    if (roots.length > visible.length) {
        const sentinel = document.createElement('div');
        sentinel.style.cssText = 'height:1px;margin-bottom:24px;';
        feed.appendChild(sentinel);
        window._feedObserver = new IntersectionObserver(function(entries) {
            if (!entries[0].isIntersecting) return;
            window._feedObserver.disconnect(); window._feedObserver = null;
            feedPage++; renderFeed();
        }, { rootMargin: '300px' });
        window._feedObserver.observe(sentinel);
    }
}

function renderMentions(container, text) {
    if (!text) return;
    text.split(/(@[\w\-]{1,32})/g).forEach(part => {
        if (/^@[\w\-]{1,32}$/.test(part)) {
            const name = part.slice(1).toLowerCase();
            const uid  = Object.keys(allUsers).find(u => (allUsers[u].displayName || '').toLowerCase() === name);
            if (uid) {
                const sp = document.createElement('span');
                sp.className = 'mention'; sp.textContent = part;
                sp.onclick = e => { e.stopPropagation(); openProfile(uid); };
                container.appendChild(sp); return;
            }
        }
        container.appendChild(document.createTextNode(part));
    });
}
function extractMentionedUids(text) {
    if (!text) return [];
    const uids = [];
    (text.match(/@[\w\-]{1,32}/g) || []).forEach(m => {
        const name = m.slice(1).toLowerCase();
        const uid  = Object.keys(allUsers).find(u => (allUsers[u].displayName || '').toLowerCase() === name);
        if (uid && uid !== me?.id && !uids.includes(uid)) uids.push(uid);
    });
    return uids;
}
async function sendMentionNotification(uid, text) {
    try {
        await db.collection('users').doc(uid).collection('notifications').add({
            type: 'mention', fromUid: me.id, fromName: me.displayName || 'Someone',
            preview: text.slice(0, 120), read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.warn('mention notif:', e.code); }
}

function buildPost(post, depth) {
    const u             = allUsers[post.authorUid] || { displayName: "Deleted User", rank: "User", verified: false };
    const isBan         = u.rank === "Banned";
    const isDeact       = u.deactivated === true;
    const canDel        = me && (me.id === post.authorUid || me.rank === "Admin");
    const likes         = post.likes  || [];
    const isLiked       = me && likes.includes(me.id);
    const views         = post.views  || [];
    const canSeeViewers = me && (me.id === post.authorUid || me.rank === "Admin");
    const emailOk       = me && (auth.currentUser?.emailVerified || me.rank === "Admin");
    const isFriendPost  = me && (me.friends || []).includes(post.authorUid);

    if (depth === 0 && me && me.id !== post.authorUid && !views.includes(me.id)) {
        db.collection("posts").doc(post.id)
            .update({ views: firebase.firestore.FieldValue.arrayUnion(me.id) })
            .catch(() => {});
    }

    const wrap = document.createElement('div');
    wrap.className = depth === 0 ? "post" : "reply-box";
    if (depth === 0) wrap.dataset.postId = post.id;

    const header = document.createElement('div');
    header.className = "post-header";

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

    const authorBtn = document.createElement('span');
    authorBtn.className = "author-btn";
    authorBtn.textContent = u.displayName;
    authorBtn.onclick = () => openProfile(post.authorUid);
    header.appendChild(authorBtn);

    if (u.verified) {
        const vc = document.createElement('img');
        vc.className  = "v-check";
        vc.src = "https://i.postimg.cc/mkWNpX47/icons8-checkmark-18.png";
        header.appendChild(vc);
    }

    if (isFriendPost) {
        const fb = document.createElement('span');
        fb.className  = "badge badge-friend";
        fb.textContent = "Friend";
        header.appendChild(fb);
    } else {
        const rb = document.createElement('span');
        rb.className  = "badge " + rankBadgeClass(u.rank);
        rb.textContent = u.rank || "User";
        header.appendChild(rb);
    }

    if (post.createdAt) {
        const ts   = document.createElement('span');
        ts.style.cssText = "font-size:0.72rem; color:var(--muted); margin-left:auto; white-space:nowrap;";
        const date = post.createdAt.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
        const now  = new Date();
        const diff = Math.floor((now - date) / 1000);
        if      (diff < 60)      ts.textContent = "just now";
        else if (diff < 3600)    ts.textContent = `${Math.floor(diff / 60)}m ago`;
        else if (diff < 86400)   ts.textContent = `${Math.floor(diff / 3600)}h ago`;
        else if (diff < 86400*7) ts.textContent = `${Math.floor(diff / 86400)}d ago`;
        else ts.textContent = date.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
        ts.title = date.toLocaleString();
        header.appendChild(ts);
    }

    wrap.appendChild(header);

    if (post.text && post.text.trim()) {
        const txt = document.createElement('p');
        txt.className = 'post-text';
        if (isBan) { txt.textContent = '[This user has been banned]'; txt.style.opacity = '0.4'; }
        else { renderMentions(txt, post.text); }
        wrap.appendChild(txt);
    }

    if (post.mediaList && post.mediaList.length > 0 && !isBan) {
        const count   = post.mediaList.length;
        const hasVideo = post.mediaList.some(m => (m.type || '').startsWith('video/'));
        const grid    = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: ${(count === 1 || hasVideo) ? '1fr' : '1fr 1fr'};
            gap: 8px;
            margin: 10px 0 14px;
        `;

        post.mediaList.forEach(media => {
            const isVideo = (media.type || '').startsWith('video/');

            if (isVideo) {
                const vid = document.createElement('video');
                vid.src      = media.url;
                vid.controls = true;
                vid.preload  = "metadata";
                vid.style.cssText = `
                    width: 100%;
                    max-height: 420px;
                    border-radius: 8px;
                    background: #000;
                    cursor: pointer;
                `;
                vid.onclick = e => {
                    if (e.target === vid && !vid.paused) return;
                };
                grid.appendChild(vid);
            } else {
                const img = document.createElement('img');
                img.src          = media.url;
                img.loading      = "lazy";
                img.style.cssText = `
                    width: 100%;
                    height: ${count === 1 ? 'auto' : '180px'};
                    object-fit: cover;
                    border-radius: 8px;
                    cursor: pointer;
                `;
                img.onclick = () => {
                    const container = document.getElementById('media-container');
                    openModal('media-modal');
                    container.innerHTML = `<img src="${media.url}" style="max-width:100%;max-height:80vh;border-radius:8px;">`;
                };
                grid.appendChild(img);
            }
        });

        wrap.appendChild(grid);
    }

    if (isDeact) {
        const note = document.createElement('p');
        note.style.cssText = "font-size:0.72rem; color:var(--muted); margin:0 0 6px; font-style:italic;";
        note.textContent    = "\u23F8 This account has been deactivated";
        wrap.appendChild(note);
    }

    if (!isBan && !isDeact) {
        const actions = document.createElement('div');
        actions.className = "post-actions";

        const likeBtn = document.createElement('span');
        likeBtn.className = "like-btn" + (isLiked ? " liked" : "");
        likeBtn.innerHTML = `\u2665 <span class="like-count">${likes.length || ""}</span>`;
        if (!me) {
            likeBtn.style.opacity = "0.35";
            likeBtn.style.cursor  = "default";
            likeBtn.title         = "Login to like";
        } else if (!emailOk) {
            likeBtn.style.opacity = "0.35";
            likeBtn.style.cursor  = "default";
            likeBtn.title         = "Verify your email to like posts";
        } else {
            likeBtn.onclick = () => toggleLike(post.id, likes, likeBtn);
        }
        actions.appendChild(likeBtn);

        const replySpan = document.createElement('span');
        replySpan.textContent = "Reply";
        if (!me) {
            replySpan.style.opacity = "0.35";
            replySpan.style.cursor  = "default";
            replySpan.title         = "Login to reply";
        } else if (!emailOk) {
            replySpan.style.opacity = "0.35";
            replySpan.style.cursor  = "default";
            replySpan.title         = "Verify your email to reply";
        } else {
            replySpan.onclick = () => replyWrap.classList.toggle('open');
        }
        actions.appendChild(replySpan);

        if (canDel) {
            const delSpan = document.createElement('span');
            delSpan.className  = "del-btn";
            delSpan.textContent = "Delete";
            delSpan.onclick = () => deletePost(post.id);
            actions.appendChild(delSpan);
        }

        if (depth === 0) {
            const viewSpan = document.createElement('span');
            viewSpan.style.cssText = "margin-left:auto; display:flex; align-items:center; gap:4px; font-size:0.78rem; color:var(--muted);";
            viewSpan.innerHTML = `Views: ${views.length}`;
            if (canSeeViewers && views.length > 0) {
                viewSpan.title        = "Click to see who viewed this";
                viewSpan.style.cursor = "pointer";
                viewSpan.onclick = () => openViewersModal(post.id, views);
            } else {
                viewSpan.title = `${views.length} view${views.length !== 1 ? 's' : ''}`;
            }
            actions.appendChild(viewSpan);
        }

        wrap.appendChild(actions);

        const replyWrap = document.createElement('div');
        replyWrap.className = "reply-input-wrap";
        if (me && emailOk) {
            const ri = document.createElement('input');
            ri.placeholder = "Write a reply..."; ri.style.flex = "1";
            ri.onkeydown = e => { if (e.key === "Enter") sendReply(post.id, ri, replyWrap); };
            const rMediaPrev = document.createElement('div');
            rMediaPrev.style.cssText = "display:none;flex-wrap:wrap;gap:6px;margin-bottom:6px;";
            const rFileInp = document.createElement('input');
            rFileInp.type='file'; rFileInp.accept='image/*'; rFileInp.multiple=true; rFileInp.style.display='none';
            rFileInp.onchange = () => {
                if (!replyMediaQueue[post.id]) replyMediaQueue[post.id] = [];
                const slots = 4 - replyMediaQueue[post.id].length;
                Array.from(rFileInp.files).slice(0, slots).forEach(f => {
                    replyMediaQueue[post.id].push({ file: f, mimeType: f.type, localUrl: URL.createObjectURL(f) });
                });
                renderReplyPreviews(post.id, rMediaPrev); rFileInp.value = '';
            };
            const rRow = document.createElement('div'); rRow.style.cssText = "display:flex;gap:6px;align-items:center;";
            const attachBtn = document.createElement('button');
            attachBtn.className='btn-sm btn-ghost'; attachBtn.title='Attach image to reply';
            attachBtn.textContent='[img]'; attachBtn.style.cssText='padding:5px 8px;flex-shrink:0;font-size:0.75rem;';
            attachBtn.onclick = () => rFileInp.click();
            const rb2 = document.createElement('button'); rb2.className="btn-sm"; rb2.textContent="Send";
            rb2.onclick = () => sendReply(post.id, ri, replyWrap);
            rRow.appendChild(ri); rRow.appendChild(attachBtn); rRow.appendChild(rFileInp); rRow.appendChild(rb2);
            replyWrap.appendChild(rMediaPrev); replyWrap.appendChild(rRow);
        }
        wrap.appendChild(replyWrap);
    }

    const _myBlocked = me ? (me.blocked || []) : [];
    const children = allPosts.filter(r => {
        if (r.parentId !== post.id) return false;
        if (_myBlocked.includes(r.authorUid)) return false;
        const _ru = allUsers[r.authorUid];
        if (_ru && (_ru.rank === 'Banned' || _ru.deactivated === true)) return false;
        return true;
    });
    if (children.length > 0 && depth === 0) {
        const childWrap = document.createElement('div');
        let collapsed   = !expandedPosts.has(post.id);
        childWrap.style.display = collapsed ? "none" : "";

        const toggleRow  = document.createElement('div');
        toggleRow.style.cssText = "margin-top:6px;";
        const toggleSpan = document.createElement('span');
        toggleSpan.style.cssText = "font-size:0.78rem; color:var(--muted); cursor:pointer;";

        const updateLabel = () => {
            const count = children.length;
            const word  = count === 1 ? 'reply' : 'replies';
            toggleSpan.textContent = collapsed
                ? `\u25B8 Show ${count} ${word}`
                : `\u25BE Hide ${count} ${word}`;
        };
        updateLabel();

        toggleSpan.onclick = () => {
            collapsed = !collapsed;
            collapsed ? expandedPosts.delete(post.id) : expandedPosts.add(post.id);
            childWrap.style.display = collapsed ? "none" : "";
            updateLabel();
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

function toggleLike(postId, currentLikes, btn) {
    if (!me) return;
    const liked    = currentLikes.includes(me.id);
    const newLikes = liked
        ? currentLikes.filter(id => id !== me.id)
        : [...currentLikes, me.id];
    db.collection("posts").doc(postId).update({ likes: newLikes });
    btn.className = "like-btn" + (!liked ? " liked" : "");
    btn.querySelector('.like-count').textContent = newLikes.length || "";
}


window.submitPost = async () => {
    if (!me) return;

    const now = Date.now();
    if (now - lastPostTime < 10000) {
        const remaining = Math.ceil((10000 - (now - lastPostTime)) / 1000);
        showAlert(`Please wait ${remaining} more second${remaining !== 1 ? 's' : ''} before posting.`);
        return;
    }

    const body = document.getElementById('post-body');
    const val  = body.value.trim();

    if (!val && postMedia.length === 0) return;

    if (containsProfanity(val)) {
        body.style.borderColor = "var(--danger)";
        setTimeout(() => body.style.borderColor = "", 2000);
        showAlert("Your post contains inappropriate language.");
        return;
    }

    const btn = document.querySelector('#post-creator button[onclick="submitPost()"]');
    if (btn) { btn.disabled = true; btn.textContent = "Posting…"; }

    try {
        const mediaArray = [];
        for (let i = 0; i < postMedia.length; i++) {
            const item     = postMedia[i];
            const isVideo  = item.mimeType.startsWith('video/');
            const label    = isVideo ? 'video' : `image ${i + 1} of ${postMedia.length}`;
            if (btn) btn.textContent = `Uploading ${label}…`;
            const url = await uploadToCloudinary(item.file);
            mediaArray.push({ url, type: item.mimeType });
        }

        await db.collection("posts").add({
            text:      val,
            authorUid: me.id,
            parentId:  null,
            likes:     [],
            views:     [],
            mediaList: mediaArray,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        lastPostTime = Date.now();
        extractMentionedUids(val).forEach(uid => sendMentionNotification(uid, val));
        body.value   = "";
        postMedia.forEach(m => URL.revokeObjectURL(m.localUrl));
        postMedia    = [];
        renderMediaPreviews();

    } catch (e) {
        console.error('Post submission error:', e);
        showAlert('Failed to post: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Post"; }
    }
};

async function sendReply(parentId, input, wrap) {
    if (!me) return;
    const now = Date.now();
    if (now - lastPostTime < 10000) {
        showAlert('Please wait ' + Math.ceil((10000 - (now - lastPostTime)) / 1000) + 's before replying.');
        return;
    }
    const val    = input.value.trim();
    const rMedia = replyMediaQueue[parentId] || [];
    if (!val && rMedia.length === 0) return;
    if (containsProfanity(val)) {
        input.style.borderColor = "var(--danger)"; const orig = input.placeholder;
        input.placeholder = "Language not allowed";
        setTimeout(() => { input.style.borderColor = ""; input.placeholder = orig; }, 2500);
        return;
    }
    const mediaArray = [];
    for (const m of rMedia) {
        try { mediaArray.push({ url: await uploadToCloudinary(m.file), type: m.mimeType }); }
        catch(e) { showAlert('Failed to upload reply image: ' + e.message); return; }
    }
    db.collection("posts").add({
        text: val, authorUid: me.id, parentId, likes: [], mediaList: mediaArray,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        lastPostTime = Date.now(); input.value = "";
        extractMentionedUids(val).forEach(uid => sendMentionNotification(uid, val));
        if (replyMediaQueue[parentId]) {
            replyMediaQueue[parentId].forEach(m => URL.revokeObjectURL(m.localUrl));
            delete replyMediaQueue[parentId];
        }
        const prev = wrap.querySelector('div[style*="flex-wrap"]');
        if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
        wrap.classList.remove('open');
        expandedPosts.add(findRootPostId(parentId));
    }).catch(err => { console.error("Reply error:", err); showAlert("Failed to send reply."); });
}

function renderReplyPreviews(parentId, container) {
    container.innerHTML = ''; const items = replyMediaQueue[parentId] || [];
    if (!items.length) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    items.forEach((m, i) => {
        const w = document.createElement('div'); w.style.cssText = "position:relative;width:56px;height:56px;";
        const img = document.createElement('img'); img.src = m.localUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid var(--primary);";
        const rm = document.createElement('button'); rm.type = 'button'; rm.innerHTML = '&times;';
        rm.style.cssText = "position:absolute;top:-5px;right:-5px;width:16px;height:16px;min-width:0;padding:0;font-size:11px;background:#ff4d4d;border:none;border-radius:50%;color:white;cursor:pointer;";
        rm.onclick = e => { e.preventDefault(); e.stopPropagation(); URL.revokeObjectURL(m.localUrl); replyMediaQueue[parentId].splice(i,1); renderReplyPreviews(parentId, container); };
        w.appendChild(img); w.appendChild(rm); container.appendChild(w);
    });
}

window.deletePost = async id => {
    if (!await showConfirm("Delete this post and all its replies? This CANNOT be undone.")) return;
    expandedPosts.delete(id);

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


document.getElementById('search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    const res = document.getElementById('search-results');
    if (!q) { res.style.display = 'none'; return; }

    const userMatches = Object.keys(allUsers)
        .filter(uid => (allUsers[uid].displayName || '').toLowerCase().includes(q));
    const postMatches = allPosts
        .filter(p => !p.parentId && p.text && p.text.toLowerCase().includes(q))
        .slice(0, 5);

    res.innerHTML = '';
    if (!userMatches.length && !postMatches.length) {
        res.innerHTML = '<div class="search-item" style="color:var(--muted)">No results found</div>';
        res.style.display = 'block'; return;
    }

    if (userMatches.length) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'padding:6px 14px 2px;font-size:0.7rem;font-weight:700;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;';
        hdr.textContent = 'Users'; res.appendChild(hdr);
        userMatches.forEach(uid => {
            const u = allUsers[uid]; const item = document.createElement('div'); item.className = 'search-item';
            item.appendChild(makeSmallAvatar(u));
            const nm = document.createElement('span'); nm.textContent = u.displayName; item.appendChild(nm);
            const rk = document.createElement('span'); rk.style.cssText = 'font-size:0.75rem;color:var(--muted);margin-left:auto;'; rk.textContent = u.rank; item.appendChild(rk);
            item.onclick = () => { openProfile(uid); res.style.display = 'none'; document.getElementById('search-bar').value = ''; };
            res.appendChild(item);
        });
    }

    if (postMatches.length) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'padding:8px 14px 2px;font-size:0.7rem;font-weight:700;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;border-top:1px solid var(--border);margin-top:4px;';
        hdr.textContent = 'Posts'; res.appendChild(hdr);
        postMatches.forEach(post => {
            const author = allUsers[post.authorUid]; const item = document.createElement('div'); item.className = 'search-item';
            item.style.cssText = 'flex-direction:column;align-items:flex-start;gap:2px;';
            const snip = document.createElement('span'); snip.style.cssText = 'font-size:0.82rem;line-height:1.4;color:var(--text);';
            snip.textContent = post.text.length > 72 ? post.text.slice(0, 72) + '...' : post.text;
            const meta = document.createElement('span'); meta.style.cssText = 'font-size:0.7rem;color:var(--muted);';
            meta.textContent = author ? 'by ' + author.displayName : 'Unknown';
            item.appendChild(snip); item.appendChild(meta);
            item.onclick = () => {
                res.style.display = 'none'; document.getElementById('search-bar').value = ''; closeAll();
                if (currentFeedTab !== 'all') switchFeedTab('all');
                const tryScroll = () => {
                    const el = document.querySelector('[data-post-id="' + post.id + '"]');
                    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--primary)'; setTimeout(() => el.style.outline = '', 2200); }
                    else if (POSTS_PER_PAGE * feedPage < allPosts.filter(p => !p.parentId).length) { feedPage++; renderFeed(); setTimeout(tryScroll, 150); }
                };
                setTimeout(tryScroll, 100);
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
    badge.className  = "badge " + rankBadgeClass(u.rank);
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

    const ar = document.getElementById('prof-action-row');
    if (!me || uid === me.id || (allUsers[uid] && allUsers[uid].deactivated)) {
        ar.classList.add('hidden');
    } else {
        ar.classList.remove('hidden');
        const fb  = document.getElementById('follow-btn');
        const frd = document.getElementById('friend-btn');
        const bb  = document.getElementById('block-btn');

        const isFol    = (me.following         || []).includes(uid);
        const isBlk    = (me.blocked           || []).includes(uid);
        const isFriend = (me.friends           || []).includes(uid);
        const sentReq  = (me.friendRequestsSent || []).includes(uid);
        const gotReq   = (me.friendRequestsIn  || []).includes(uid);

        fb.innerHTML  = isFol
            ? '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Following'
            : '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Follow';
        fb.className  = "btn-follow" + (isFol ? " following" : "");
        fb.disabled   = isBlk;

        bb.innerHTML  = isBlk
            ? '<img src="https://i.postimg.cc/sxYYRT08/icons8-block-100.png" class="btn-icon"> Blocked'
            : '<img src="https://i.postimg.cc/sxYYRT08/icons8-block-100.png" class="btn-icon"> Block';
        bb.className  = "btn-block" + (isBlk ? " blocked" : "");

        if (frd) {
            frd.disabled = isBlk;
            if (isFriend) {
                frd.innerHTML     = '<img src="https://i.postimg.cc/8CqcsJPQ/icons8-user-account-100.png" class="btn-icon"> Friends';
                frd.className     = "btn-friend";
            } else if (gotReq) {
                frd.innerHTML     = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Accept';
                frd.className     = "btn-friend";
            } else if (sentReq) {
                frd.innerHTML     = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Sent';
                frd.className     = "btn-friend-pending";
            } else {
                frd.innerHTML     = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Add Friend';
                frd.className     = "btn-ghost";
                frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";
            }
        }
    }

    refreshProfileTabs(uid);
    switchProfileTab('posts');
    openModal('profile-modal');
};

function refreshProfileTabs(uid) {
    const u = allUsers[uid];
    if (!u) return;

    const uPosts   = allPosts.filter(p => p.authorUid === uid && !p.parentId);
    const uReplies = allPosts.filter(p => p.authorUid === uid &&  p.parentId);
    const followers = u.followers || [];
    const following = u.following || [];
    const friends   = u.friends   || [];

    document.getElementById('stat-posts')    .textContent = uPosts.length;
    document.getElementById('stat-replies')  .textContent = uReplies.length;
    document.getElementById('stat-followers').textContent = followers.length;
    document.getElementById('stat-following').textContent = following.length;
    const FriendsStat = document.getElementById('stat-friends');
    FriendsStat.textContent = friends.length;
    if (friends.length >= 1) {FriendsStat.innerText = friends.length} else {FriendsStat.innerText = "NO"}

    const postsEl = document.getElementById('content-posts');
    postsEl.innerHTML = "";
    if (!uPosts.length) {
        postsEl.innerHTML = '<div class="empty-tab">No posts yet.</div>';
    } else {
        uPosts.forEach(post => {
            const rc   = allPosts.filter(r => r.parentId === post.id).length;
            const lc   = (post.likes || []).length;
            const card = document.createElement('div');
            card.className = "prof-post-card";
            const textSnippet = post.text && post.text.trim()
                ? post.text
                : '<span style="color:var(--muted); font-style:italic; font-size:0.9rem;">[Media]</span>';
            card.innerHTML = `<div>${textSnippet}</div>
                <div class="prof-post-meta">\u2665 ${lc} &middot; ${rc} ${rc === 1 ? 'reply' : 'replies'}</div>`;
            card.onclick = () => {
                closeAll();
                if (currentFeedTab !== 'all') switchFeedTab('all');
                const tryFind = () => {
                    const el = document.querySelector('[data-post-id="' + post.id + '"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.outline = '2px solid var(--primary)';
                        setTimeout(() => el.style.outline = '', 2000);
                    } else if (POSTS_PER_PAGE * feedPage < allPosts.filter(p => !p.parentId).length) {
                        feedPage++;
                        renderFeed();
                        setTimeout(tryFind, 150);
                    }
                };
                setTimeout(tryFind, 120);
            };
            postsEl.appendChild(card);
        });
    }

    const repliesEl = document.getElementById('content-replies');
    repliesEl.innerHTML = "";
    if (!uReplies.length) {
        repliesEl.innerHTML = '<div class="empty-tab">No replies yet.</div>';
    } else {
        uReplies.forEach(reply => {
            const parent = allPosts.find(p => p.id === reply.parentId);
            const lc     = (reply.likes || []).length;
            const card   = document.createElement('div');
            card.className = "prof-post-card";
            card.innerHTML = `<div>${reply.text}</div>
                <div class="prof-post-meta">\u2665 ${lc} &middot; replying to:
                    ${parent
                        ? parent.text.slice(0, 40) + (parent.text.length > 40 ? '...' : '')
                        : 'deleted post'}
                </div>`;
            const rootId = findRootPostId(reply.parentId);
            card.onclick = () => {
                closeAll();
                if (currentFeedTab !== 'all') switchFeedTab('all');
                const tryFindReply = () => {
                    const el = document.querySelector('[data-post-id="' + rootId + '"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.outline = '2px solid var(--primary)';
                        setTimeout(() => el.style.outline = '', 2000);
                    } else if (POSTS_PER_PAGE * feedPage < allPosts.filter(p => !p.parentId).length) {
                        feedPage++;
                        renderFeed();
                        setTimeout(tryFindReply, 150);
                    }
                };
                setTimeout(tryFindReply, 120);
            };
            repliesEl.appendChild(card);
        });
    }

    buildUserList('content-followers', followers, 'No followers yet.');
    buildUserList('content-following', following, 'Not following anyone yet.');
    buildUserList('content-friends',   friends,   'No friends yet.');
}

function buildUserList(containerId, uids, emptyMsg) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';

    const valid = uids.filter(uid => allUsers[uid]);

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'margin-bottom:10px;';
    const searchInp = document.createElement('input');
    searchInp.type        = 'text';
    searchInp.placeholder = 'Search...';
    searchInp.style.cssText = 'width:100%;padding:7px 12px;border-radius:8px;font-size:0.85rem;margin:0;';
    searchWrap.appendChild(searchInp);
    el.appendChild(searchWrap);

    if (!valid.length) {
        const em = document.createElement('div');
        em.className = 'empty-tab';
        em.textContent = emptyMsg;
        el.appendChild(em);
        return;
    }

    const rowsWrap = document.createElement('div');
    el.appendChild(rowsWrap);

    valid.forEach(uid => {
        const u   = allUsers[uid];
        const row = document.createElement('div');
        row.className       = 'follower-row user-list-row';
        row.dataset.name    = (u.displayName || '').toLowerCase();
        row.appendChild(makeSmallAvatar(u));
        const nm = document.createElement('span');
        nm.className   = 'follower-name';
        nm.textContent = u.displayName;
        row.appendChild(nm);
        row.onclick = () => openProfile(uid);
        rowsWrap.appendChild(row);
    });

    searchInp.addEventListener('input', function() {
        const q = this.value.toLowerCase().trim();
        let anyVisible = false;
        rowsWrap.querySelectorAll('.user-list-row').forEach(row => {
            const match = !q || row.dataset.name.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        let noRes = rowsWrap.querySelector('.user-list-no-results');
        if (!anyVisible) {
            if (!noRes) {
                noRes = document.createElement('div');
                noRes.className = 'empty-tab user-list-no-results';
                noRes.textContent = 'No results for "' + this.value + '"';
                rowsWrap.appendChild(noRes);
            }
        } else if (noRes) {
            noRes.remove();
        }
    });
}

window.switchProfileTab = tab => {
    ['posts', 'replies', 'followers', 'following', 'friends'].forEach(t => {
        document.getElementById(`ptab-${t}`)   .classList.toggle('active', t === tab);
        document.getElementById(`content-${t}`).classList.toggle('active', t === tab);
    });
};


window.toggleFollow = async () => {
    if (!me || !currentProfileUid || currentProfileUid === me.id) return;
    const tuid = currentProfileUid;
    const fb   = document.getElementById('follow-btn');

    if ((me.blocked || []).includes(tuid)) return;
    fb.disabled = true;
    let _fs; try { _fs = await db.collection('users').doc(tuid).get(); } catch(e){ fb.disabled=false; return; }
    const _fd = _fs.exists ? _fs.data() : null;
    if (_fd) allUsers[tuid] = { ...allUsers[tuid], ..._fd };
    if (_fd && (_fd.blocked||[]).includes(me.id)) { showAlert('You cannot follow this user.'); fb.disabled=false; return; }
    const isFol = (me.following || []).includes(tuid);
    try {
        if (isFol) {
            await db.collection('users').doc(me.id).update({ following: firebase.firestore.FieldValue.arrayRemove(tuid) });
            await db.collection('users').doc(tuid).update({ followers: firebase.firestore.FieldValue.arrayRemove(me.id) });
        } else {
            await db.collection('users').doc(me.id).update({ following: firebase.firestore.FieldValue.arrayUnion(tuid) });
            await db.collection('users').doc(tuid).update({ followers: firebase.firestore.FieldValue.arrayUnion(me.id) });
        }
        fb.innerHTML = isFol
            ? '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Follow'
            : '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Following';
        fb.className = 'btn-follow' + (isFol ? '' : ' following');
    } catch (e) {
        console.error('Follow error:', e.code, e.message);
        showAlert('Follow failed (' + (e.code||'unknown') + '): ' + e.message);
    }
    fb.disabled = false;
};

window.toggleFriendRequest = async () => {
    if (!me || !currentProfileUid || currentProfileUid === me.id) return;
    const tuid = currentProfileUid;

    if ((me.blocked || []).includes(tuid)) return;
    const frd = document.getElementById('friend-btn');
    frd.disabled = true;
    let _frs; try { _frs = await db.collection('users').doc(tuid).get(); } catch(e){ frd.disabled=false; return; }
    const _frd = _frs.exists ? _frs.data() : null;
    if (_frd) allUsers[tuid] = { ...allUsers[tuid], ..._frd };
    if (_frd && (_frd.blocked||[]).includes(me.id)) { showAlert('You cannot send a friend request to this user.'); frd.disabled=false; return; }
    const isFriend = (me.friends            || []).includes(tuid);
    const sentReq  = (me.friendRequestsSent || []).includes(tuid);
    const gotReq   = (me.friendRequestsIn   || []).includes(tuid);

    try {
        if (isFriend) {
            if (!await showConfirm(`Remove ${allUsers[tuid]?.displayName} as a friend?`)) {
                frd.disabled = false;
                return;
            }
            await db.collection('users').doc(me.id).update({ friends: firebase.firestore.FieldValue.arrayRemove(tuid) });
            await db.collection('users').doc(tuid).update({ friends: firebase.firestore.FieldValue.arrayRemove(me.id) });
            frd.innerHTML     = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Add Friend';
            frd.className     = "btn-ghost";
            frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";

        } else if (gotReq) {
            await respondFriendRequest(tuid, true);

        } else if (sentReq) {
            await db.collection('users').doc(me.id).update({ friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(tuid) });
            await db.collection('users').doc(tuid).update({ friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(me.id) });
            frd.innerHTML     = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Add Friend';
            frd.className     = "btn-ghost";
            frd.style.cssText = "flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;";

        } else {
            await db.collection('users').doc(me.id).update({ friendRequestsSent: firebase.firestore.FieldValue.arrayUnion(tuid) });
            await db.collection('users').doc(tuid).update({ friendRequestsIn: firebase.firestore.FieldValue.arrayUnion(me.id) });
            frd.innerHTML = '<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Sent';
            frd.className = "btn-friend-pending";
        }
    } catch (e) {
        console.error('Friend request error:', e.code, e.message);
        showAlert('Friend request failed (' + (e.code||'unknown') + '): ' + e.message);
    }
    frd.disabled = false;
};

async function respondFriendRequest(fromUid, accept) {
    const myUpdate = { friendRequestsIn:   firebase.firestore.FieldValue.arrayRemove(fromUid) };
    const thUpdate = { friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(me.id) };
    if (accept) {
        myUpdate.friends = firebase.firestore.FieldValue.arrayUnion(fromUid);
        thUpdate.friends = firebase.firestore.FieldValue.arrayUnion(me.id);
    }
    try {
        await db.collection('users').doc(me.id).update(myUpdate);
        await db.collection('users').doc(fromUid).update(thUpdate);
        if (currentProfileUid === fromUid) openProfile(fromUid);
    } catch (e) {
        console.error('respondFriendRequest:', e.code, e.message);
        showAlert('Failed to respond to friend request (' + (e.code||'unknown') + '): ' + e.message);
    }
}

window.toggleBlock = async () => {
    if (!me || !currentProfileUid || currentProfileUid === me.id) return;
    const tuid  = currentProfileUid;
    const isBlk = (me.blocked || []).includes(tuid);
    if (!isBlk && !await showConfirm(`Block ${allUsers[tuid]?.displayName}? Their posts will be hidden and all connections removed.`)) return;

    const bb  = document.getElementById('block-btn');
    const fb  = document.getElementById('follow-btn');
    const frd = document.getElementById('friend-btn');
    bb.disabled = true;

    try {
        if (isBlk) {
            await db.collection('users').doc(me.id).update({ blocked: firebase.firestore.FieldValue.arrayRemove(tuid) });
            bb.innerHTML = '<img src="https://i.postimg.cc/sxYYRT08/icons8-block-100.png" class="btn-icon"> Block';
            bb.className = 'btn-block';
            fb.disabled = false;
            fb.innerHTML = '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Follow';
            fb.className = 'btn-follow';
            if (frd) { frd.disabled=false; frd.innerHTML='<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Add Friend'; frd.className='btn-ghost'; frd.style.cssText='flex:1; min-width:80px; font-size:0.85rem; padding:7px 10px;'; }
        } else {
            await db.collection('users').doc(me.id).update({
                blocked: firebase.firestore.FieldValue.arrayUnion(tuid),
                following: firebase.firestore.FieldValue.arrayRemove(tuid),
                followers: firebase.firestore.FieldValue.arrayRemove(tuid),
                friends: firebase.firestore.FieldValue.arrayRemove(tuid),
                friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(tuid),
                friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(tuid)
            });
            await db.collection('users').doc(tuid).update({
                followers: firebase.firestore.FieldValue.arrayRemove(me.id),
                following: firebase.firestore.FieldValue.arrayRemove(me.id),
                friends: firebase.firestore.FieldValue.arrayRemove(me.id),
                friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(me.id),
                friendRequestsIn: firebase.firestore.FieldValue.arrayRemove(me.id)
            });
            bb.innerHTML = '<img src="https://i.postimg.cc/sxYYRT08/icons8-block-100.png" class="btn-icon"> Blocked';
            bb.className = 'btn-block blocked';
            fb.innerHTML = '<img src="https://i.postimg.cc/Y2RN8sY4/Add_Button.png" class="btn-icon"> Follow';
            fb.className = 'btn-follow'; fb.disabled = true;
            if (frd) { frd.innerHTML='<img src="https://i.postimg.cc/2jLdHhBh/icons8-add-user-male-100-removebg-preview.png" class="btn-icon"> Add Friend'; frd.className='btn-ghost'; frd.disabled=true; }
        }
    } catch (e) {
        console.error('Block/Unblock error:', e.code, e.message);
        showAlert('Block action failed (' + (e.code||'unknown') + '): ' + e.message);
    }
    bb.disabled = false;
};


window.switchSettingsTab = tab => {
    const tabs = ['profile', 'following', 'friends', 'blocked', 'account'];
    document.querySelectorAll('.settings-tab')
        .forEach((el, i) => el.classList.toggle('active', tabs[i] === tab));
    document.querySelectorAll('.settings-pane')
        .forEach(el => el.classList.remove('active'));
    document.getElementById(`spane-${tab}`).classList.add('active');
    if (tab === 'following') renderSettingsFollowing();
    if (tab === 'friends')   renderSettingsFriends();
    if (tab === 'blocked')   renderSettingsBlocked();
};

function renderSettingsFollowing() {
    const list = document.getElementById('settings-following-list');
    list.innerHTML = '';
    const following = me?.following || [];

    const si = document.createElement('input');
    si.type = 'text'; si.placeholder = 'Search following...';
    si.style.cssText = 'width:100%;padding:7px 12px;border-radius:8px;font-size:0.85rem;margin:0 0 10px;';
    list.appendChild(si);

    if (!following.length) {
        const em = document.createElement('div'); em.className = 'empty-tab';
        em.textContent = 'You\'re not following anyone yet.'; list.appendChild(em); return;
    }
    const wrap = document.createElement('div'); list.appendChild(wrap);
    following.forEach(uid => {
        const u = allUsers[uid]; if (!u) return;
        const row = document.createElement('div');
        row.className = 'follower-row settings-list-row'; row.dataset.name = (u.displayName||'').toLowerCase();
        row.appendChild(makeSmallAvatar(u));
        const nm = document.createElement('span'); nm.className = 'follower-name';
        nm.textContent = u.displayName; nm.onclick = () => openProfile(uid); nm.style.cursor = 'pointer';
        row.appendChild(nm);
        const btn = document.createElement('button'); btn.className = 'unblock-btn'; btn.textContent = 'Unfollow';
        btn.onclick = async () => {
            await db.collection('users').doc(me.id).update({ following: firebase.firestore.FieldValue.arrayRemove(uid) });
            await db.collection('users').doc(uid).update({ followers: firebase.firestore.FieldValue.arrayRemove(me.id) });
            renderSettingsFollowing();
        };
        row.appendChild(btn); wrap.appendChild(row);
    });
    si.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        wrap.querySelectorAll('.settings-list-row').forEach(r => { r.style.display = (!q || r.dataset.name.includes(q)) ? '' : 'none'; });
    });
}

function renderSettingsFriends() {
    const reqsContainer = document.getElementById('settings-friends-requests');
    const list          = document.getElementById('settings-friends-list');
    reqsContainer.innerHTML = "";
    list.innerHTML          = "";

    const reqs = (me?.friendRequestsIn || []).filter(uid => allUsers[uid]);
    if (reqs.length) {
        const hdr = document.createElement('p');
        hdr.style.cssText = "font-size:0.8rem; font-weight:700; color:var(--text); margin:0 0 10px;";
        hdr.textContent   = `Incoming Friend Requests (${reqs.length})`;
        reqsContainer.appendChild(hdr);

        reqs.forEach(uid => {
            const u    = allUsers[uid];
            const card = document.createElement('div');
            card.className = "friend-req-card";
            card.appendChild(makeSmallAvatar(u));
            const nm = document.createElement('span');
            nm.style.cssText = "font-weight:600; font-size:0.88rem; flex:1; cursor:pointer;";
            nm.textContent   = u.displayName;
            nm.onclick       = () => { closeModal('settings-modal'); openProfile(uid); };
            card.appendChild(nm);
            const btnWrap = document.createElement('div');
            btnWrap.className = "req-btns";
            const acc = document.createElement('button');
            acc.className  = "btn-sm";
            acc.textContent = "Accept";
            acc.onclick = async () => {
                acc.disabled = true; acc.textContent = "...";
                await respondFriendRequest(uid, true);
                renderSettingsFriends();
            };
            const dec = document.createElement('button');
            dec.className  = "btn-sm btn-ghost";
            dec.textContent = "Decline";
            dec.onclick = async () => {
                dec.disabled = true; dec.textContent = "...";
                await respondFriendRequest(uid, false);
                renderSettingsFriends();
            };
            btnWrap.appendChild(acc);
            btnWrap.appendChild(dec);
            card.appendChild(btnWrap);
            reqsContainer.appendChild(card);
        });

        const divider = document.createElement('hr');
        divider.className    = "divider";
        divider.style.margin = "14px 0";
        reqsContainer.appendChild(divider);
    }

    const friends = (me?.friends || []).filter(uid => allUsers[uid]);
    const fhdr    = document.createElement('p');
    fhdr.style.cssText = "font-size:0.8rem; font-weight:700; color:var(--text); margin:0 0 10px;";
    fhdr.textContent   = `Friends (${friends.length})`;
    list.appendChild(fhdr);

    if (!friends.length) {
        const em = document.createElement('div');
        em.className  = "empty-tab";
        em.textContent = "No friends yet. Add friends from their profile!";
        list.appendChild(em);
        return;
    }

    const sfInp = document.createElement('input');
    sfInp.type = 'text'; sfInp.placeholder = 'Search friends...';
    sfInp.style.cssText = 'width:100%;padding:7px 12px;border-radius:8px;font-size:0.85rem;margin:0 0 10px;';
    list.insertBefore(sfInp, list.firstChild);
    const friendWrap = document.createElement('div'); list.appendChild(friendWrap);

    friends.forEach(uid => {
        const u = allUsers[uid];
        const row = document.createElement('div');
        row.className = 'follower-row settings-list-row'; row.dataset.name = (u.displayName||'').toLowerCase();
        row.appendChild(makeSmallAvatar(u));
        const nm = document.createElement('span'); nm.className = 'follower-name';
        nm.textContent = u.displayName;
        nm.onclick = () => { closeModal('settings-modal'); openProfile(uid); }; nm.style.cursor = 'pointer';
        row.appendChild(nm);
        const btn = document.createElement('button'); btn.className = 'unblock-btn'; btn.textContent = 'Unfriend';
        btn.onclick = async () => {
            await db.collection('users').doc(me.id).update({ friends: firebase.firestore.FieldValue.arrayRemove(uid) });
            await db.collection('users').doc(uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(me.id) });
            renderSettingsFriends();
        };
        row.appendChild(btn); friendWrap.appendChild(row);
    });
    sfInp.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        friendWrap.querySelectorAll('.settings-list-row').forEach(r => { r.style.display = (!q || r.dataset.name.includes(q)) ? '' : 'none'; });
    });
}

function renderSettingsBlocked() {
    const list = document.getElementById('settings-blocked-list');
    list.innerHTML = '';
    const blocked = me?.blocked || [];

    const sbInp = document.createElement('input');
    sbInp.type = 'text'; sbInp.placeholder = 'Search blocked...';
    sbInp.style.cssText = 'width:100%;padding:7px 12px;border-radius:8px;font-size:0.85rem;margin:0 0 10px;';
    list.appendChild(sbInp);

    if (!blocked.length) {
        const em = document.createElement('div'); em.className = 'empty-tab';
        em.textContent = "You haven't blocked anyone."; list.appendChild(em); return;
    }
    const wrap = document.createElement('div'); list.appendChild(wrap);
    blocked.forEach(uid => {
        const u = allUsers[uid];
        const row = document.createElement('div');
        row.className = 'blocked-row settings-list-row'; row.dataset.name = ((u?.displayName)||'').toLowerCase();
        row.appendChild(makeSmallAvatar(u));
        const nm = document.createElement('span'); nm.className = 'blocked-row-name';
        nm.textContent = u?.displayName || 'Unknown'; row.appendChild(nm);
        const btn = document.createElement('button'); btn.className = 'unblock-btn'; btn.textContent = 'Unblock';
        btn.onclick = async () => {
            await db.collection('users').doc(me.id).update({ blocked: firebase.firestore.FieldValue.arrayRemove(uid) });
            renderSettingsBlocked();
        };
        row.appendChild(btn); wrap.appendChild(row);
    });
    sbInp.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        wrap.querySelectorAll('.settings-list-row').forEach(r => { r.style.display = (!q || r.dataset.name.includes(q)) ? '' : 'none'; });
    });
}

window.openSettings = () => {
    if (!auth.currentUser) return;

    document.getElementById('set-email-display').textContent = auth.currentUser.email || "";
    document.getElementById('set-username').value            = me ? (me.displayName || "") : "";
    document.getElementById('set-bio').value                 = me ? (me.bio || "")         : "";

    clearMsg('profile-msg');
    clearMsg('pass-msg');
    renderAvatarEl(document.getElementById('settings-pfp-preview'), me);

    const rb = document.getElementById('remove-pfp-btn');
    if (rb) (me && me.photoURL) ? rb.classList.remove('hidden') : rb.classList.add('hidden');

    const ad = document.getElementById('settings-account-age');
    if (ad) {
        if (me && me.createdAt) {
            ad.textContent = ` Account ${formatAccountAge(me.createdAt)}`;
        } else if (auth.currentUser.metadata?.creationTime) {
            ad.textContent = ` Account ${formatAccountAge(new Date(auth.currentUser.metadata.creationTime))}`;
        } else {
            ad.textContent = "";
        }
    }

    const uploadBtn    = document.querySelector('.pfp-upload-btn');
    const isAdminPfp   = isAdminUID(auth.currentUser.uid);
    const isOld        = isAdminPfp || (me ? accountOlderThan(me.createdAt, 3600) : false);
    const emailVerified = isAdminPfp || auth.currentUser.emailVerified;
    const canUpload    = isOld && emailVerified;
    if (uploadBtn) {
        uploadBtn.disabled      = !canUpload;
        uploadBtn.style.opacity  = canUpload ? "" : "0.4";
        uploadBtn.title = !isOld
            ? "Account must be at least 1 hour old to upload a photo"
            : !emailVerified
            ? "Must verify your email before uploading a photo"
            : "";
    }

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

window.saveMyProfile = async () => {
    const name = document.getElementById('set-username').value.trim();
    const bio  = document.getElementById('set-bio').value;
    if (!name) { showMsg('profile-msg', "Username cannot be empty.", "error"); return; }
    if (containsProfanity(name)) { showMsg('profile-msg', "Username contains inappropriate language.", "error"); return; }
    if (containsProfanity(bio))  { showMsg('profile-msg', "Bio contains inappropriate language.", "error"); return; }
    try {
        await db.collection("users").doc(me.id).update({ displayName: name, bio });
        showMsg('profile-msg', "Profile saved!", "success");
    } catch (e) {
        showMsg('profile-msg', "Failed to save. Please try again.", "error");
    }
};

window.handlePfpUpload = async e => {
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

    const uploadBtn = document.querySelector('.pfp-upload-btn');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = "Uploading…"; }

    try {
        const photoURL = await uploadToCloudinary(file);
        document.getElementById('settings-pfp-preview').innerHTML =
            `<img src="${photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        await db.collection("users").doc(me.id).update({ photoURL });
        document.getElementById('remove-pfp-btn').classList.remove('hidden');
        showMsg('profile-msg', "Profile photo updated!", "success");
    } catch (err) {
        console.error('PFP upload error:', err);
        showMsg('profile-msg', "Failed to upload photo: " + err.message, "error");
    } finally {
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = "Change Photo"; }
        e.target.value = "";
    }
};

window.removePfp = async () => {
    try {
        await db.collection("users").doc(me.id).update({ photoURL: "" });
        const prev = document.getElementById('settings-pfp-preview');
        prev.innerHTML  = "";
        prev.textContent = (me.displayName || "?")[0].toUpperCase();
        document.getElementById('remove-pfp-btn').classList.add('hidden');
        showMsg('profile-msg', "Profile photo removed.", "success");
    } catch (err) {
        showMsg('profile-msg', "Failed to remove photo.", "error");
    }
};

window.handlePasswordChange = async () => {
    clearMsg('pass-msg');
    const oldP = document.getElementById('old-pass').value;
    const newP = document.getElementById('new-pass').value;
    const conP = document.getElementById('conf-pass').value;
    if (!oldP || !newP || !conP) { showMsg('pass-msg', "Please fill in all three fields."); return; }
    if (newP.length < 6)          { showMsg('pass-msg', "New password must be at least 6 characters."); return; }
    if (newP !== conP)             { showMsg('pass-msg', "New passwords don't match."); return; }
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

window.openChangeEmailModal = () => {
    ['ce-new-email', 'ce-confirm-email', 'ce-password'].forEach(id => {
        document.getElementById(id).value = '';
    });
    clearMsg('ce-msg');
    const btn = document.getElementById('ce-btn');
    btn.disabled    = false;
    btn.textContent = 'Send Verification Email';
    openSubModal('change-email-modal');
};

window.confirmChangeEmail = async () => {
    const newEmail     = document.getElementById('ce-new-email').value.trim().toLowerCase();
    const confirmEmail = document.getElementById('ce-confirm-email').value.trim().toLowerCase();
    const password     = document.getElementById('ce-password').value;
    const btn          = document.getElementById('ce-btn');
    clearMsg('ce-msg');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail)                                              { showMsg('ce-msg', "Please enter a new email address."); return; }
    if (!emailRegex.test(newEmail))                             { showMsg('ce-msg', "Please enter a valid email address."); return; }
    if (newEmail === auth.currentUser.email.toLowerCase())      { showMsg('ce-msg', "New email is the same as your current email."); return; }
    if (newEmail !== confirmEmail)                              { showMsg('ce-msg', "Email addresses don't match."); return; }
    if (!password)                                              { showMsg('ce-msg', "Please enter your current password."); return; }

    btn.disabled    = true;
    btn.textContent = 'Updating...';
    try {
        const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, password);
        await auth.currentUser.reauthenticateWithCredential(cred);
        await auth.currentUser.updateEmail(newEmail);
        await auth.currentUser.sendEmailVerification();
        await auth.signOut();
        location.reload();
    } catch (e) {
        btn.disabled    = false;
        btn.textContent = 'Send Verification Email';
        if      (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') showMsg('ce-msg', "Incorrect password. Please try again.");
        else if (e.code === 'auth/email-already-in-use') showMsg('ce-msg', "That email is already in use by another account.");
        else if (e.code === 'auth/invalid-email')        showMsg('ce-msg', "Please enter a valid email address.");
        else if (e.code === 'auth/requires-recent-login') showMsg('ce-msg', "Session expired. Please log out and back in first.");
        else showMsg('ce-msg', "Failed to update email: " + (e.message || "Unknown error."));
    }
};

['ce-new-email', 'ce-confirm-email', 'ce-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') confirmChangeEmail(); });
});

window.openDeactivateModal = () => {
    document.getElementById('deactivate-confirm-pass').value  = '';
    document.getElementById('confirm-deactivate-msg').textContent = '';
    document.getElementById('confirm-deactivate-msg').className   = 'msg msg-error';
    document.getElementById('confirm-deactivate-btn').disabled    = false;
    document.getElementById('confirm-deactivate-btn').textContent = 'Deactivate My Account';
    openSubModal('confirm-deactivate-modal');
};

window.closeDeactivateModal = () => {
    closeSubModal('confirm-deactivate-modal');
    document.getElementById('deactivate-confirm-pass').value = '';
};

window.toggleDeactivatePassVis = () => {
    const inp = document.getElementById('deactivate-confirm-pass');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
};

window.confirmDeactivateAccount = async () => {
    const password = document.getElementById('deactivate-confirm-pass').value;
    const msgEl    = document.getElementById('confirm-deactivate-msg');
    const btn      = document.getElementById('confirm-deactivate-btn');
    msgEl.textContent = '';
    msgEl.className   = 'msg msg-error';

    if (!password) {
        msgEl.textContent = 'Please enter your password.';
        msgEl.className   = 'msg msg-error show';
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Deactivating...';
    try {
        const cred = firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, password);
        await auth.currentUser.reauthenticateWithCredential(cred);
        await db.collection("users").doc(me.id).update({
            deactivated:        true,
            rank:               "Deactivated",
            following:          [],
            followers:          [],
            blocked:            [],
            friends:            [],
            friendRequestsSent: [],
            friendRequestsIn:   []
        });
        await auth.signOut();
        location.reload();
    } catch (e) {
        btn.disabled    = false;
        btn.textContent = 'Deactivate My Account';
        msgEl.className = 'msg msg-error show';
        if      (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msgEl.textContent = 'Incorrect password. Please try again.';
        else if (e.code === 'auth/requires-recent-login') msgEl.textContent = 'Session expired. Please log out and back in first.';
        else msgEl.textContent = `Error: ${e.message}`;
    }
};


let isSignup = false;

window.runAuth = async () => {
    clearMsg('auth-msg');
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-pass').value;
    if (!email) { showMsg('auth-msg', "Please enter your email."); return; }
    if (!pass)  { showMsg('auth-msg', "Please enter your password."); return; }

    const btn = document.getElementById('auth-btn');
    btn.disabled    = true;
    btn.textContent = isSignup ? "Creating account..." : "Logging in...";

    try {
        if (isSignup) {
            const r = await auth.createUserWithEmailAndPassword(email, pass);
            await db.collection("users").doc(r.user.uid).set({
                displayName:        email.split('@')[0],
                rank:               isBootstrap(r.user.uid) ? "Admin" : "User",
                verified:           isBootstrap(r.user.uid),
                bio:                "",
                photoURL:           "",
                followers:          [],
                following:          [],
                blocked:            [],
                friends:            [],
                friendRequestsSent: [],
                friendRequestsIn:   [],
                createdAt:          firebase.firestore.FieldValue.serverTimestamp()
            });
            await r.user.sendEmailVerification();
            showMsg('auth-msg',
                `\u2705 Account created! Verification email sent to ${email}. Please verify before posting.`,
                "success"
            );
            isSignup = false;
            document.getElementById('auth-title').textContent = "Login";
            document.getElementById('auth-btn').textContent   = "Login";

        } else {
            const r    = await auth.signInWithEmailAndPassword(email, pass);
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
                                rank:       "User",
                                bannedUntil: firebase.firestore.FieldValue.delete(),
                                banReason:   firebase.firestore.FieldValue.delete()
                            });
                        } else {
                            await auth.signOut();
                            const mins = Math.ceil((until - new Date()) / 60000);
                            const tl   = mins < 60
                                ? `${mins} minute${mins !== 1 ? 's' : ''}`
                                : `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) !== 1 ? 's' : ''}`;
                            const r2 = data.banReason ? ` Reason: ${data.banReason}.` : '';
                            showMsg('auth-msg', `Your account is banned for ${tl}.${r2} If you think this was a mistake, Email (catylastfourms@gmail.com)`);
                            return;
                        }
                    } else {
                        await auth.signOut();
                        const r2p = data.banReason ? ` Reason: ${data.banReason}.` : '';
                        showMsg('auth-msg', `Your account has been permanently banned.${r2p} If you think this was a mistake, Email (catylastfourms@gmail.com)`);
                        return;
                    }
                }
            }
            closeAll();
        }
    } catch (e) {
        showMsg('auth-msg', friendlyAuthError(e.code));
    } finally {
        btn.disabled    = false;
        btn.textContent = isSignup ? "Sign Up" : "Login";
    }
};

window.toggleAuthMode = () => {
    isSignup = !isSignup;
    clearMsg('auth-msg');
    document.getElementById('auth-title').textContent       = isSignup ? "Sign Up" : "Login";
    document.getElementById('auth-btn').textContent         = isSignup ? "Sign Up" : "Login";
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
        showMsg('auth-msg', `\u2705 Password reset email sent to ${email}. Check your inbox.`, "success");
    } catch (e) {
        if      (e.code === 'auth/user-not-found') showMsg('auth-msg', "No account found with that email.");
        else if (e.code === 'auth/invalid-email')  showMsg('auth-msg', "Please enter a valid email address.");
        else showMsg('auth-msg', "Failed to send reset email.");
    }
};

['auth-email', 'auth-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === "Enter") runAuth();
    });
});

window.resendVerification = async () => {
    const btn = document.getElementById('resend-verify-btn');
    btn.disabled    = true;
    btn.textContent = "Sending...";
    try {
        await auth.currentUser.sendEmailVerification();
        btn.textContent = "Sent \u2713";
        setTimeout(() => { btn.disabled = false; btn.textContent = "Resend Email"; }, 30000);
    } catch (e) {
        btn.textContent = "Try again later";
        setTimeout(() => { btn.disabled = false; btn.textContent = "Resend Email"; }, 5000);
    }
};


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
    const u   = allUsers[uid];
    const row = document.createElement('div');
    row.className    = "admin-row";
    row.dataset.uid  = uid;
    row.dataset.name = (u.displayName || "").toLowerCase();

    const top = document.createElement('div');
    top.className = "admin-row-top";

    const nm = document.createElement('span');
    nm.style.cssText = "font-weight:700; font-size:0.9rem; flex:1;";
    nm.textContent   = u.displayName || "Unknown";
    top.appendChild(nm);

    if (u.verified) {
        const vb = document.createElement('span');
        vb.className  = "badge badge-verified";
        vb.textContent = "\u2714 Verified";
        top.appendChild(vb);
    }
    if (u.rank === "Admin") {
        const ab = document.createElement('span');
        ab.className  = "badge badge-admin";
        ab.textContent = "Admin";
        top.appendChild(ab);
    }
    if (u.deactivated) {
        const db2 = document.createElement('span');
        db2.className  = "badge badge-banned";
        db2.textContent = "Deactivated";
        top.appendChild(db2);
    }
    if (u.rank && !SYSTEM_RANKS.includes(u.rank)) {
        const crb = document.createElement('span');
        crb.className  = "badge badge-custom";
        crb.textContent = u.rank;
        top.appendChild(crb);
    }
    if (u.pendingEmail) {
        const peb = document.createElement('span');
        peb.className    = "badge";
        peb.style.cssText = "background:rgba(251,191,36,0.15); color:#fbbf24; border-color:#fbbf24;";
        peb.title         = `Pending: ${u.pendingEmail}`;
        peb.textContent   = "Email pending";
        top.appendChild(peb);
    }
    if (u.rank === "Banned") {
        const bb = document.createElement('span');
        bb.className = "badge badge-banned";
        if (u.bannedUntil) {
            const until = u.bannedUntil.toDate ? u.bannedUntil.toDate() : new Date(u.bannedUntil);
            const mins  = Math.ceil((until - new Date()) / 60000);
            bb.textContent = mins > 0
                ? `Banned (${mins < 60 ? mins + 'm' : Math.ceil(mins / 60) + 'h'})`
                : "Banned";
        } else {
            bb.textContent = "Banned";
        }
        top.appendChild(bb);
        if (u.banReason) {
            const br = document.createElement('span');
            br.style.cssText = "font-size:0.75rem; color:var(--muted); margin-left:6px;";
            br.textContent = `Reason: ${u.banReason}`;
            top.appendChild(br);
        }
    }
    row.appendChild(top);

    const uidEl = document.createElement('code');
    uidEl.className = "admin-row-uid";
    uidEl.title     = "Click to copy UID";
    uidEl.textContent = uid;
    uidEl.onclick = () => {
        navigator.clipboard.writeText(uid).then(() => {
            uidEl.textContent   = "\u2714 Copied!";
            uidEl.style.color   = "var(--success)";
            setTimeout(() => { uidEl.textContent = uid; uidEl.style.color = ""; }, 1800);
        });
    };
    row.appendChild(uidEl);

    const btns = document.createElement('div');
    btns.className = "admin-row-btns";

    const vBtn = document.createElement('button');
    vBtn.className  = "btn-sm";
    vBtn.textContent = u.verified ? "Unverify" : "Verify";
    vBtn.onclick = () => adminAction(uid, { verified: !u.verified }, vBtn, u.verified ? "Unverified" : "Verified \u2714");
    btns.appendChild(vBtn);

    if (uid !== me?.id) {
        const aBtn = document.createElement('button');
        aBtn.className  = "btn-sm btn-admin";
        aBtn.textContent = u.rank === "Admin" ? "Remove Admin" : "Make Admin";
        aBtn.onclick = () => adminAction(uid,
            { rank: u.rank === "Admin" ? "User" : "Admin" },
            aBtn,
            u.rank === "Admin" ? "Demoted" : "Promoted \u2714"
        );
        btns.appendChild(aBtn);

        const crBtn = document.createElement('button');
        crBtn.className   = "btn-sm";
        crBtn.style.cssText = "background:rgba(168,85,247,0.2); color:#c084fc; border:1px solid #c084fc;";
        crBtn.textContent  = "Set Rank";
        crBtn.onclick = () => showCustomRankDialog(uid, u.displayName, u.rank || "User");
        btns.appendChild(crBtn);

        const msgBtn = document.createElement('button');
        msgBtn.className = "btn-sm";
        msgBtn.style.cssText = "background:rgba(56,189,248,0.15);color:var(--primary);border:1px solid var(--primary);";
        msgBtn.textContent = "Message";
        msgBtn.onclick = () => adminSendNotification(uid, u.displayName);
        btns.appendChild(msgBtn);

        const isBanned = u.rank === "Banned";
        const bBtn     = document.createElement('button');
        bBtn.className = "btn-sm btn-danger";
        if (isBanned) {
            let lbl = "Unban";
            if (u.bannedUntil) {
                const until = u.bannedUntil.toDate ? u.bannedUntil.toDate() : new Date(u.bannedUntil);
                const mins  = Math.ceil((until - new Date()) / 60000);
                if (mins > 0) lbl = `Unban (${mins < 60 ? mins + 'm' : Math.ceil(mins / 60) + 'h'} left)`;
            }
            bBtn.textContent = lbl;
            bBtn.onclick = () => adminAction(uid,
                { rank: "User", bannedUntil: firebase.firestore.FieldValue.delete(), banReason: firebase.firestore.FieldValue.delete() },
                bBtn, "Unbanned"
            );
        } else {
            bBtn.textContent = "Ban";
            bBtn.onclick = async () => {
                const choice = await showBanDialog(u.displayName);
                if (!choice) return;
                const upd = { rank: "Banned", verified: false };
                if (choice.duration !== "permanent") {
                    upd.bannedUntil = firebase.firestore.Timestamp.fromDate(
                        new Date(Date.now() + choice.duration * 60000)
                    );
                }
                if (choice.reason) upd.banReason = choice.reason;
                await adminAction(uid, upd, bBtn, "Banned");
            };
        }
        btns.appendChild(bBtn);

        if (!isAdminUID(uid)) {
            const dBtn = document.createElement('button');
            dBtn.className    = "btn-sm btn-danger";
            dBtn.style.opacity = "0.7";
            if (u.deactivated) {
                dBtn.textContent       = "Reactivate";
                dBtn.style.background  = "var(--success)";
                dBtn.style.color       = "#0f172a";
                dBtn.onclick = () => adminAction(uid, { deactivated: false, rank: "User" }, dBtn, "Reactivated");
            } else {
                dBtn.textContent = "Deactivate";
                dBtn.onclick = () => adminDeactivate(uid, u.displayName, dBtn);
            }
            btns.appendChild(dBtn);
        }

        const wipeBtn = document.createElement('button');
        wipeBtn.className    = "btn-sm btn-danger";
        wipeBtn.style.opacity = "0.7";
        wipeBtn.textContent  = "Wipe Posts";
        wipeBtn.onclick = () => adminWipePosts(uid, u.displayName, wipeBtn);
        btns.appendChild(wipeBtn);

        const emailBtn = document.createElement('button');
        emailBtn.className = "btn-sm btn-ghost";
        if (u.pendingEmail) {
            emailBtn.textContent    = "Cancel Email Change";
            emailBtn.style.cssText  = "border-color:var(--danger); color:var(--danger);";
            emailBtn.title          = `Pending: ${u.pendingEmail}`;
            emailBtn.onclick = async () => {
                if (!await showConfirm(`Cancel the pending email change for ${u.displayName}?`)) return;
                emailBtn.disabled    = true;
                emailBtn.textContent = "Cancelling...";
                try {
                    await db.collection("users").doc(uid).update({
                        pendingEmail: firebase.firestore.FieldValue.delete(),
                        verified:     true
                    });
                    allUsers[uid] = { ...allUsers[uid], pendingEmail: undefined, verified: true };
                    renderAdminList();
                } catch (e) {
                    emailBtn.disabled    = false;
                    emailBtn.textContent = "Cancel Email Change";
                    showAlert("Failed: " + e.message);
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

function showCustomRankDialog(uid, displayName, currentRank) {
    document.getElementById('rank-dialog')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = "rank-dialog";
    overlay.className = "rank-overlay";
    overlay.onclick   = e => { if (e.target === overlay) overlay.remove(); };

    const box = document.createElement('div');
    box.className = "rank-box";

    const title = document.createElement('h3');
    title.textContent = "Set Rank";
    box.appendChild(title);

    const desc = document.createElement('p');
    desc.innerHTML = `Custom rank badge for <strong>${displayName}</strong>. Shows on their posts and profile.`;
    box.appendChild(desc);

    const inp = document.createElement('input');
    inp.type        = "text";
    inp.maxLength   = 20;
    inp.placeholder = "Enter rank name...";
    inp.value       = !SYSTEM_RANKS.includes(currentRank) ? currentRank : "";
    inp.style.margin = "0 0 10px";
    box.appendChild(inp);

    const presetsLabel = document.createElement('p');
    presetsLabel.style.cssText = "font-size:0.75rem; color:var(--muted); margin:0 0 8px;";
    presetsLabel.textContent   = "Quick presets:";
    box.appendChild(presetsLabel);

    const presetsWrap = document.createElement('div');
    presetsWrap.className = "rank-presets";
    ["Moderator", "VIP", "Trusted", "Helper", "Founder", "Bot", "Staff"].forEach(p => {
        const btn = document.createElement('span');
        btn.className  = "rank-preset";
        btn.textContent = p;
        btn.onclick = () => inp.value = p;
        presetsWrap.appendChild(btn);
    });
    const clearPreset = document.createElement('span');
    clearPreset.className  = "rank-preset clear";
    clearPreset.textContent = "\u2715 Clear rank";
    clearPreset.onclick = () => inp.value = "";
    presetsWrap.appendChild(clearPreset);
    box.appendChild(presetsWrap);

    const btnRow = document.createElement('div');
    btnRow.className = "rank-dialog-btns";
    const applyBtn  = document.createElement('button');
    applyBtn.textContent = "Apply Rank";
    const cancelBtn = document.createElement('button');
    cancelBtn.className  = "btn-ghost";
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
            inp.placeholder       = "\u26A0 Inappropriate rank name";
            setTimeout(() => { inp.style.borderColor = ""; inp.placeholder = "Enter rank name..."; }, 2000);
            return;
        }
        if (!newRank) newRank = "User";
        applyBtn.disabled    = true;
        applyBtn.textContent = "Saving...";
        try {
            await db.collection("users").doc(uid).update({ rank: newRank });
            allUsers[uid] = { ...allUsers[uid], rank: newRank };
            overlay.remove();
            renderAdminList();
            renderFeed();
        } catch (e) {
            applyBtn.disabled    = false;
            applyBtn.textContent = "Apply Rank";
            inp.style.borderColor = "var(--danger)";
            inp.placeholder       = "Failed \u2014 check Firestore rules";
            setTimeout(() => { inp.style.borderColor = ""; inp.placeholder = "Enter rank name..."; }, 3000);
        }
    }
}

function showChangeEmailDialog(uid, displayName) {
    document.getElementById('email-change-dialog')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = "email-change-dialog";
    overlay.className = "rank-overlay";
    overlay.onclick   = e => { if (e.target === overlay) overlay.remove(); };

    const box = document.createElement('div');
    box.className = "rank-box";

    const title = document.createElement('h3');
    title.textContent = "Change Email";
    box.appendChild(title);

    const desc = document.createElement('p');
    desc.innerHTML = `Set a new email address for <strong>${displayName}</strong>.`;
    box.appendChild(desc);

    const l1 = document.createElement('p');
    l1.style.cssText = "font-size:0.8rem; color:var(--muted); margin:0 0 4px;";
    l1.textContent   = "New email address";
    box.appendChild(l1);

    const emailInp = document.createElement('input');
    emailInp.type        = "email";
    emailInp.placeholder = "newaddress@example.com";
    emailInp.style.margin = "0 0 10px";
    box.appendChild(emailInp);

    const l2 = document.createElement('p');
    l2.style.cssText = "font-size:0.8rem; color:var(--muted); margin:0 0 4px;";
    l2.textContent   = "Confirm new email";
    box.appendChild(l2);

    const confirmInp = document.createElement('input');
    confirmInp.type        = "email";
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

    const btnRow   = document.createElement('div');
    btnRow.className = "rank-dialog-btns";
    const applyBtn  = document.createElement('button');
    applyBtn.textContent = "Save Email";
    const cancelBtn = document.createElement('button');
    cancelBtn.className  = "btn-ghost";
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
        if (!ne)                  { showErr("Please enter a new email address."); return; }
        if (!emailRegex.test(ne)) { showErr("Please enter a valid email address."); return; }
        if (ne !== ce)            { showErr("Email addresses don't match."); return; }
        applyBtn.disabled    = true;
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
                "font-weight:600", "z-index:3000"
            ].join(';');
            toast.textContent = `New email saved for ${displayName}. They'll need to verify it on next login.`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        } catch (e) {
            applyBtn.disabled    = false;
            applyBtn.textContent = "Save Email";
            showErr("Failed: " + e.message);
        }
    }

    function showErr(msg) {
        errMsg.textContent   = msg;
        errMsg.style.display = "block";
        setTimeout(() => { errMsg.style.display = "none"; }, 4000);
    }
}

async function adminWipePosts(uid, displayName, btn) {
    const userPosts = allPosts.filter(p => p.authorUid === uid);
    if (!userPosts.length) {
        showAlert(`${displayName} has no posts to delete.`);
        return;
    }
    if (!await showConfirm(`Delete ALL ${userPosts.length} post${userPosts.length !== 1 ? 's' : ''} by ${displayName}?\n\nThis cannot be undone.`)) return;

    btn.disabled    = true;
    btn.textContent = "Wiping...";
    try {
        for (let i = 0; i < userPosts.length; i += 400) {
            const batch = db.batch();
            userPosts.slice(i, i + 400).forEach(p => batch.delete(db.collection("posts").doc(p.id)));
            await batch.commit();
        }
        const topIds  = new Set(userPosts.filter(p => !p.parentId).map(p => p.id));
        const orphans = allPosts.filter(p => p.parentId && topIds.has(p.parentId) && p.authorUid !== uid);
        for (let i = 0; i < orphans.length; i += 400) {
            const batch = db.batch();
            orphans.slice(i, i + 400).forEach(p => batch.delete(db.collection("posts").doc(p.id)));
            await batch.commit();
        }
        btn.textContent       = "Wiped \u2714";
        btn.style.background  = "var(--success)";
        btn.style.color       = "#0f172a";
        setTimeout(() => {
            btn.disabled      = false;
            btn.textContent   = "Wipe Posts";
            btn.style.background = "";
            btn.style.color   = "";
            renderAdminList();
        }, 1500);
        renderFeed();
    } catch (e) {
        console.error('Wipe error:', e);
        btn.disabled    = false;
        btn.textContent = "Wipe Posts";
        showAlert("Failed to wipe posts: " + e.message);
    }
}

async function adminDeactivate(uid, displayName, btn) {
    if (isAdminUID(uid)) {
        showAlert("The bootstrap admin account cannot be deactivated.");
        return;
    }
    if (uid === me?.id) {
        showAlert("You cannot deactivate your own account from the admin panel.");
        return;
    }
    if (!await showConfirm(`Deactivate ${displayName}'s account?\n\nTheir posts will remain visible but they will be locked out.`)) return;

    btn.disabled    = true;
    btn.textContent = "Deactivating...";
    try {
        await db.collection("users").doc(uid).update({
            deactivated:        true,
            rank:               "Deactivated",
            following:          [],
            followers:          [],
            blocked:            [],
            friends:            [],
            friendRequestsSent: [],
            friendRequestsIn:   []
        });
        allUsers[uid] = { ...allUsers[uid], deactivated: true, rank: "Deactivated" };
        renderFeed();
        renderAdminList();
    } catch (e) {
        btn.disabled    = false;
        btn.textContent = "Deactivate";
        showAlert("Failed: " + e.message);
    }
}

function showBanDialog(displayName) {
    return new Promise(resolve => {
        document.getElementById('ban-dialog')?.remove();

        const overlay = document.createElement('div');
        overlay.id    = "ban-dialog";
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
            { label: "\u23F1 30 minutes", val: 30 },
            { label: "\u23F1 1 hour",     val: 60 },
            { label: "\u23F1 6 hours",    val: 360 },
            { label: "\uD83D\uDCC5 1 day",       val: 1440 },
            { label: "\uD83D\uDCC5 7 days",      val: 10080 },
            { label: "\uD83D\uDCC5 30 days",     val: 43200 },
        ];

        box.innerHTML = `
            <h3 style="margin:0 0 6px;">Ban ${displayName}</h3>
            <p style="color:var(--muted); font-size:0.85rem; margin:0 0 16px;">Select ban duration:</p>
            <div style="display:flex; flex-direction:column; gap:8px;" id="ban-options"></div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function askReason(duration) {
            box.innerHTML = `
                <h3 style="margin:0 0 6px;">Ban ${displayName}</h3>
                <p style="color:var(--muted); font-size:0.85rem; margin:0 0 12px;">Reason (optional):</p>
                <input id="ban-reason-input" type="text" placeholder="e.g. Spamming, harassment\u2026"
                       style="width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;
                              border:1px solid var(--border);background:var(--bg);color:var(--text);
                              font-size:0.9rem;margin-bottom:12px;">
                <div style="display:flex;gap:8px;">
                    <button id="ban-confirm-btn"
                            style="flex:1;background:rgba(239,68,68,0.15);border:1px solid var(--danger);
                                   color:var(--danger);padding:9px;border-radius:8px;font-weight:600;cursor:pointer;">
                        Confirm Ban
                    </button>
                    <button id="ban-cancel-btn"
                            style="flex:1;background:transparent;border:1px solid var(--border);
                                   color:var(--muted);padding:9px;border-radius:8px;font-weight:600;cursor:pointer;">
                        Cancel
                    </button>
                </div>
            `;
            const inp = box.querySelector('#ban-reason-input');
            inp.focus();
            box.querySelector('#ban-confirm-btn').onclick = () => {
                const reason = inp.value.trim();
                overlay.remove();
                resolve({ duration, reason: reason || null });
            };
            box.querySelector('#ban-cancel-btn').onclick = () => {
                overlay.remove();
                resolve(null);
            };
        }

        const opts = box.querySelector('#ban-options');
        durations.forEach(({ label, val }) => {
            const btn = document.createElement('button');
            btn.textContent    = label;
            btn.style.cssText  = "background:var(--bg); border:1px solid var(--border); color:var(--text); text-align:left; padding:10px 14px; border-radius:8px; font-weight:600; cursor:pointer;";
            btn.onmouseenter  = () => btn.style.borderColor = "var(--danger)";
            btn.onmouseleave  = () => btn.style.borderColor = "var(--border)";
            btn.onclick = () => askReason(val);
            opts.appendChild(btn);
        });

        const permBtn = document.createElement('button');
        permBtn.textContent   = "\uD83D\uDEAB Permanent";
        permBtn.style.cssText = "background:rgba(239,68,68,0.12); border:1px solid var(--danger); color:var(--danger); text-align:left; padding:10px 14px; border-radius:8px; font-weight:600; cursor:pointer;";
        permBtn.onclick = () => askReason("permanent");
        opts.appendChild(permBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent   = "Cancel";
        cancelBtn.style.cssText = "background:transparent; border:1px solid var(--border); color:var(--muted); padding:8px; border-radius:8px; font-weight:600; cursor:pointer; margin-top:2px;";
        cancelBtn.onclick = () => { overlay.remove(); resolve(null); };
        opts.appendChild(cancelBtn);
    });
}

async function adminAction(uid, update, btn, successLabel) {
    btn.disabled    = true;
    btn.textContent = "...";
    try {
        await db.collection("users").doc(uid).update(update);
        const fresh = await db.collection("users").doc(uid).get();
        if (fresh.exists) allUsers[uid] = fresh.data();
        btn.textContent = successLabel;
        setTimeout(() => renderAdminList(), 900);
    } catch (e) {
        console.error('adminAction error:', e.code, e.message);
        btn.textContent      = "Error: " + (e.code || e.message || "unknown");
        btn.style.background = "var(--danger)";
        btn.style.color      = "white";
        setTimeout(() => {
            btn.disabled         = false;
            btn.textContent      = "Retry";
            btn.style.background = "";
            btn.style.color      = "";
        }, 3500);
    }
}

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

window.openViewersModal = (postId, viewUids) => {
    const list = document.getElementById('viewers-list');
    list.innerHTML = "";
    const valid = viewUids.filter(uid => allUsers[uid]);
    if (!valid.length) {
        list.innerHTML = '<div class="empty-tab">No views yet.</div>';
    } else {
        valid.forEach(uid => {
            const u   = allUsers[uid];
            const row = document.createElement('div');
            row.className = "follower-row";
            row.appendChild(makeSmallAvatar(u));
            const nm = document.createElement('span');
            nm.className  = "follower-name";
            nm.textContent = u.displayName;
            row.appendChild(nm);
            row.onclick = () => { closeModal('viewers-modal'); openProfile(uid); };
            list.appendChild(row);
        });
    }
    openModal('viewers-modal');
};

window.openOwnProfile = () => { if (me) openProfile(me.id); };
window._notifCache = [];

window.openNotifications = async function() {
    if (!me) return;
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('notif-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    const srch = document.getElementById('notif-search');
    if (srch) srch.value = '';
    window._notifCache = [];
    const list = document.getElementById('notif-list');
    list.innerHTML = '<div class="notif-loading">Loading...</div>';
    try {
        const snap = await db.collection('users').doc(me.id)
            .collection('notifications')
            .orderBy('createdAt', 'desc').limit(50).get();
        const batch = db.batch();
        snap.docs.forEach(d => { if (!d.data().read) batch.update(d.ref, { read: true }); });
        batch.commit().catch(() => {});
        window._notifCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._renderNotifList(window._notifCache);
    } catch(e) {
        list.innerHTML = '<p style="color:var(--danger);font-size:.85rem;padding:12px 0;">Error: ' + (e.code || e.message) + '</p>';
    }
};

window._renderNotifList = function(items) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = '';
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'notif-empty';
        const ico = document.createElement('div'); ico.className = 'notif-empty-icon'; ico.textContent = '\uD83D\uDD14'.replace(/./su, c => c);
        empty.appendChild(ico);
        const msg = document.createElement('div'); msg.textContent = 'No notifications yet.';
        const sub = document.createElement('div'); sub.className = 'notif-empty-sub'; sub.textContent = '@mention someone in a post to send them a notification.';
        empty.appendChild(msg); empty.appendChild(sub);
        list.appendChild(empty);
        return;
    }
    items.forEach(n => {
        const row = document.createElement('div');
        row.className = 'notif-row' + (n.read ? '' : ' notif-unread');
        const iconWrap = document.createElement('div');
        iconWrap.className = 'notif-icon';
        const fromUser = n.fromUid ? allUsers[n.fromUid] : null;
        if (fromUser) {
            iconWrap.appendChild(makeSmallAvatar(fromUser));
        } else {
            iconWrap.textContent = String.fromCodePoint(0x1F514);
            iconWrap.style.fontSize = '1.2rem';
        }
        const content = document.createElement('div');
        content.className = 'notif-content';
        const title = document.createElement('div');
        title.className = 'notif-title';
        const nameSpan = document.createElement('span');
        nameSpan.style.color = 'var(--primary)';
        nameSpan.textContent = '@' + (n.fromName || 'Someone');
        title.appendChild(nameSpan);
        title.appendChild(document.createTextNode(' mentioned you'));
        const preview = document.createElement('div');
        preview.className = 'notif-preview';
        preview.textContent = n.preview || '';
        const ts = document.createElement('div');
        ts.className = 'notif-ts';
        const d2   = n.createdAt ? (n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)) : new Date();
        const diff = Math.floor((Date.now() - d2) / 1000);
        ts.textContent = diff < 60 ? 'just now'
            : diff < 3600   ? Math.floor(diff / 60) + 'm ago'
            : diff < 86400  ? Math.floor(diff / 3600) + 'h ago'
            : diff < 604800 ? Math.floor(diff / 86400) + 'd ago'
            : d2.toLocaleDateString();
        content.appendChild(title);
        content.appendChild(preview);
        content.appendChild(ts);
        row.appendChild(iconWrap);
        row.appendChild(content);
        row.onclick = () => { closeAll(); if (n.fromUid) openProfile(n.fromUid); };
        list.appendChild(row);
    });
};

window.filterNotifications = function() {
    const el = document.getElementById('notif-search');
    const q  = (el ? el.value : '').toLowerCase().trim();
    if (!window._notifCache) return;
    const filtered = q
        ? window._notifCache.filter(n =>
            (n.fromName || '').toLowerCase().includes(q) ||
            (n.preview  || '').toLowerCase().includes(q))
        : window._notifCache;
    window._renderNotifList(filtered);
};

(function() {
    function setup(id) {
        document.addEventListener('DOMContentLoaded', () => {
            const ta = document.getElementById(id); if (!ta) return;
            let dd = null;
            const getQ  = () => { const m = ta.value.slice(0, ta.selectionStart).match(/@([\w\-]*)$/); return m ? m[1] : null; };
            const rmDd  = () => { if (dd) { dd.remove(); dd = null; } };
            const showDd = q => {
                rmDd();
                const hits = Object.keys(allUsers).filter(uid => {
                    const u = allUsers[uid];
                    return (u.displayName || '').toLowerCase().startsWith(q.toLowerCase()) && !u.deactivated && uid !== me?.id;
                }).slice(0, 6);
                if (!hits.length) return;
                dd = document.createElement('div');
                dd.className = 'mention-dropdown';
                const r = ta.getBoundingClientRect();
                dd.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + (r.bottom + 4) + 'px;'
                    + 'width:' + Math.min(r.width, 260) + 'px;max-height:200px;overflow-y:auto;'
                    + 'background:rgba(14,18,32,.98);border:1px solid rgba(255,255,255,.14);'
                    + 'border-radius:10px;z-index:2000;box-shadow:0 8px 24px rgba(0,0,0,.5);';
                hits.forEach(uid => {
                    const u = allUsers[uid]; const item = document.createElement('div');
                    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:.85rem;';
                    item.appendChild(makeSmallAvatar(u));
                    const nm = document.createElement('span'); nm.textContent = u.displayName; item.appendChild(nm);
                    item.onmouseenter = () => item.style.background = 'rgba(56,189,248,.10)';
                    item.onmouseleave = () => item.style.background = '';
                    item.onmousedown  = e => {
                        e.preventDefault();
                        const pos = ta.selectionStart;
                        const before = ta.value.slice(0, pos).replace(/@[\w\-]*$/, '@' + u.displayName + ' ');
                        ta.value = before + ta.value.slice(pos);
                        ta.selectionStart = ta.selectionEnd = before.length;
                        ta.focus(); rmDd();
                    };
                    dd.appendChild(item);
                });
                document.body.appendChild(dd);
            };
            ta.addEventListener('input',   () => { const q = getQ(); q !== null ? showDd(q) : rmDd(); });
            ta.addEventListener('keydown', e  => { if (e.key === 'Escape') rmDd(); });
            ta.addEventListener('blur',    () => setTimeout(rmDd, 150));
        });
    }
    setup('post-body');
    setup('quick-post-body');
})();


function updateMenuUserRow() {
    if (!me) return;
    const row   = document.getElementById('menu-user-row');
    const uname = document.getElementById('menu-username');
    const av    = document.getElementById('menu-avatar');
    if (!row || !uname || !av) return;
    row.classList.remove('hidden');
    uname.textContent = me.displayName || '';
    renderAvatarEl(av, me);
}

function dmConvId(a, b) { return [a, b].sort().join('_'); }

function startNotificationListener(uid) {
    if (window._notifStarted) return;
    window._notifStarted = true;
    db.collection('users').doc(uid).collection('notifications')
      .where('read', '==', false)
      .onSnapshot(snap => {
          const badge = document.getElementById('notif-badge');
          if (!badge) return;
          badge.textContent   = snap.size || '';
          badge.style.display = snap.size ? 'inline-block' : 'none';
      }, err => console.warn('notif listener:', err.code));
}

function startDMBadgeListener(uid) {
    if (window._dmBadgeStarted) return;
    window._dmBadgeStarted = true;
    db.collection('directMessages').where('participants', 'array-contains', uid)
      .onSnapshot(snap => {
            let unread = 0;
            snap.forEach(doc => {
                const d = doc.data(), lr = (d.lastRead && d.lastRead[uid]) || 0, la = d.lastMessageAt ? d.lastMessageAt.toMillis() : 0;
                if (la > lr) unread++;
            });
            const badge = document.getElementById('dm-dots-badge');
            if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? 'inline-block' : 'none'; }
        }, err => console.warn('DM badge listener error:', err.code));
}

window.openInbox = () => {
    if (!me) { openModal('auth-modal'); return; }
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('inbox-modal').style.display = 'block';
    renderInbox();
};

function renderInbox() {
    const list = document.getElementById('inbox-list');
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;padding:10px 0;">Loading...</p>';
    db.collection('directMessages').where('participants', 'array-contains', me.id).get()
      .then(snap => {
            list.innerHTML = '';
            if (snap.empty) { list.innerHTML = '<div class="empty-tab" style="padding:28px 0;">No messages yet.</div>'; return; }
            const docs = [];
            snap.forEach(doc => docs.push(doc));
            docs.sort((a,b) => {
                const at = a.data().lastMessageAt ? a.data().lastMessageAt.toMillis() : 0;
                const bt = b.data().lastMessageAt ? b.data().lastMessageAt.toMillis() : 0;
                return bt - at;
            });
            docs.forEach(doc => {
                const convId = doc.id, d = doc.data();
                const otherUid = (d.participants||[]).find(u => u !== me.id);
                const other = allUsers[otherUid] || { displayName: 'Catalyst', photoURL: '' };
                if ((me.blocked||[]).includes(otherUid) && !isAdminUID(otherUid)) return;
                const lr = (d.lastRead && d.lastRead[me.id]) || 0;
                const la = d.lastMessageAt ? d.lastMessageAt.toMillis() : 0;
                const isUnread = la > lr;
                const row = document.createElement('div');
                row.className = 'follower-row dm-inbox-row'; row.style.cssText = 'padding:10px 6px;gap:8px;';
                row.appendChild(makeSmallAvatar(other));
                const info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;cursor:pointer;';
                info.onclick = () => openDMWindow(otherUid);
                const nl = document.createElement('div');
                nl.style.cssText = 'font-weight:' + (isUnread?'700':'600') + ';font-size:0.88rem;display:flex;align-items:center;gap:6px;';
                nl.textContent = other.displayName;
                if (isUnread) { const dot=document.createElement('span'); dot.style.cssText='width:7px;height:7px;border-radius:50%;background:var(--primary);display:inline-block;flex-shrink:0;'; nl.appendChild(dot); }
                const pv = document.createElement('div');
                pv.style.cssText = 'font-size:0.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                pv.textContent = (d.lastMessageText||'').slice(0,60)||'...';
                info.appendChild(nl); info.appendChild(pv); row.appendChild(info);
                const deleteReqs    = d.deleteRequest || {};
                const iRequested    = !!deleteReqs[me.id];
                const theyRequested = otherUid && !!deleteReqs[otherUid];

                const delBtn = document.createElement('button');
                delBtn.className = 'btn-sm btn-ghost inbox-del-btn';

                function applyDelBtnState() {
                    if (theyRequested && !iRequested) {
                        delBtn.textContent = '\u26A0\uFE0F Agree?';
                        delBtn.title       = (other.displayName || 'Other person') + ' wants to delete this. Click to agree.';
                        delBtn.style.cssText = 'color:var(--danger);border-color:var(--danger);opacity:1;flex-shrink:0;';
                    } else if (iRequested) {
                        delBtn.textContent = '\u23F3 Pending';
                        delBtn.title       = 'Waiting for ' + (other.displayName||'other person') + ' to agree. Click to cancel.';
                        delBtn.style.cssText = 'color:#fbbf24;border-color:#fbbf24;opacity:1;flex-shrink:0;';
                    } else {
                        delBtn.textContent = '\u{1F5D1}';
                        delBtn.title       = 'Request to delete this conversation';
                        delBtn.style.cssText = '';
                    }
                }
                applyDelBtnState();

                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    delBtn.disabled = true;
                    try {
                        const freshConv = await db.collection('directMessages').doc(convId).get();
                        const freshReqs = freshConv.exists ? (freshConv.data().deleteRequest || {}) : {};
                        const iReq      = !!freshReqs[me.id];
                        const theyReq   = otherUid && !!freshReqs[otherUid];

                        if (iReq) {
                            if (!await showConfirm('Cancel your delete request?')) { delBtn.disabled=false; return; }
                            await db.collection('directMessages').doc(convId).update({
                                ['deleteRequest.' + me.id]: firebase.firestore.FieldValue.delete()
                            });
                            delBtn.textContent   = '\u{1F5D1}';
                            delBtn.style.cssText = '';
                        } else if (theyReq) {
                            if (!await showConfirm(
                                (other.displayName||'The other person') + ' has requested to delete this conversation.\n\nDo you agree? This cannot be undone.'
                            )) { delBtn.disabled=false; return; }
                            await deleteConversationAndMessages(convId);
                            row.remove();
                            if (!list.querySelector('.dm-inbox-row')) list.innerHTML = '<div class="empty-tab" style="padding:28px 0;">No messages yet.</div>';
                            return;
                        } else {
                            if (!await showConfirm(
                                'Request to delete this conversation?\n\n'
                                + (other.displayName||'The other person') + ' will also need to agree before it is permanently deleted.'
                            )) { delBtn.disabled=false; return; }
                            await db.collection('directMessages').doc(convId).update({
                                ['deleteRequest.' + me.id]: true
                            });
                            delBtn.textContent   = '\u23F3 Pending';
                            delBtn.title         = 'Waiting for ' + (other.displayName||'the other person') + ' to agree. Click to cancel.';
                            delBtn.style.cssText = 'color:#fbbf24;border-color:#fbbf24;opacity:1;flex-shrink:0;';
                        }
                    } catch (err) {
                        console.error('Delete convo error:', err.code, err.message);
                        showAlert('Failed: ' + (err.code||err.message));
                    }
                    delBtn.disabled = false;
                };
                row.appendChild(delBtn); list.appendChild(row);
            });
        })
      .catch(err => {
            console.error('renderInbox:', err.code, err.message);
            list.innerHTML = '<p style="color:var(--danger);font-size:0.85rem;padding:10px 0;">Error: ' + (err.code||err.message) + '</p>';
        });
}

window.openDMWindow = uid => {
    if (!me) return;
    activeDMUid = uid; const other = allUsers[uid] || { displayName: 'Unknown' };
    document.getElementById('dm-with-name').textContent = other.displayName;
    renderAvatarEl(document.getElementById('dm-with-avatar'), other);
    document.getElementById('inbox-modal').style.display = 'none';
    document.getElementById('dm-modal').style.display    = 'flex';
    db.collection('directMessages').doc(dmConvId(me.id, uid))
      .set({ lastRead: { [me.id]: Date.now() } }, { merge: true }).catch(() => {});
    loadDMMessages(uid);
};

function loadDMMessages(uid) {
    const c = document.getElementById('dm-messages');
    const convId = dmConvId(me.id, uid);
    c.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:20px 0;">Loading...</p>';
    if (dmMessagesUnsub) { dmMessagesUnsub(); dmMessagesUnsub = null; }
    dmMessagesUnsub = db.collection('directMessages').doc(convId)
        .collection('msgs').orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            c.innerHTML = '';
            if (snap.empty) { c.innerHTML = '<div class="empty-tab" style="padding:28px 0;">No messages yet.</div>'; return; }
            snap.forEach(doc => {
                const msgId = doc.id, msg = doc.data(), isMine = msg.senderUid === me.id;
                const wrapper = document.createElement('div');
                wrapper.className = 'msg-wrapper';
                wrapper.style.cssText = 'display:flex;align-items:flex-end;gap:4px;margin-bottom:6px;' + (isMine ? 'flex-direction:row-reverse;' : '');
                const bubble = document.createElement('div');
                bubble.style.cssText = 'max-width:80%;padding:9px 13px;border-radius:' + (isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px') + ';background:' + (isMine ? 'var(--primary)' : 'rgba(255,255,255,0.07)') + ';color:' + (isMine ? '#0f172a' : 'var(--text)') + ';font-size:0.88rem;line-height:1.5;word-break:break-word;';
                bubble.textContent = msg.text || '';
                if (msg.createdAt) {
                    const ts = document.createElement('div'), d2 = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
                    ts.style.cssText = 'font-size:0.64rem;opacity:0.5;text-align:' + (isMine ? 'right' : 'left') + ';margin-top:3px;';
                    ts.textContent = d2.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); bubble.appendChild(ts);
                }
                wrapper.appendChild(bubble);
                if (isMine) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'msg-del-btn'; delBtn.title = 'Delete message'; delBtn.textContent = '\u{1F5D1}';
                    delBtn.onclick = async () => {
                        if (!await showConfirm('Delete this message?')) return;
                        delBtn.disabled = true;
                        try {
                            await db.collection('directMessages').doc(convId).collection('msgs').doc(msgId).delete();
                        } catch (e) {
                            console.error('Delete msg error:', e.code, e.message);
                            showAlert('Could not delete message: ' + (e.code||e.message));
                            delBtn.disabled = false;
                        }
                    };
                    wrapper.appendChild(delBtn);
                }
                c.appendChild(wrapper);
            });
            c.scrollTop = c.scrollHeight;
        }, err => {
            console.error('loadDMMessages:', err.code, err.message);
            c.innerHTML = '<p style="color:var(--danger);font-size:0.85rem;text-align:center;padding:20px 0;">Error: ' + (err.code||err.message) + '</p>';
        });
}

window.sendDM = async () => {
    if (!me || !activeDMUid) return;
    const input = document.getElementById('dm-input'), text = input.value.trim();
    if (!text) return;
    const cid = dmConvId(me.id, activeDMUid);
    if (!isAdminUID(me.id)) {
        const snap = await db.collection('directMessages').doc(cid).get().catch(() => null);
        if (!snap || !snap.exists) { showAlert('You can only reply to messages sent to you by the Catalyst team.'); return; }
    }
    input.value = ''; input.disabled = true;
    try {
        await db.collection('directMessages').doc(cid).collection('msgs').add({ senderUid: me.id, text, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        await db.collection('directMessages').doc(cid).set({ participants: [me.id, activeDMUid], lastMessageText: text, lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastRead: { [me.id]: Date.now() } }, { merge: true });
    } catch(e) { showAlert('Failed to send: ' + e.message); }
    finally { input.disabled = false; input.focus(); }
};

document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('dm-input');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(); } });
});

window.closeDMToInbox = () => {
    if (dmMessagesUnsub) { dmMessagesUnsub(); dmMessagesUnsub = null; }
    activeDMUid = null;
    document.getElementById('dm-modal').style.display    = 'none';
    document.getElementById('inbox-modal').style.display = 'block';
    renderInbox();
};

window.adminSendNotification = async (targetUid, displayName) => {
    const text = await showPrompt('Send a message to ' + displayName + ':');
    if (!text || !text.trim()) return;
    const cid = dmConvId(me.id, targetUid);
    try {
        await db.collection('directMessages').doc(cid).collection('msgs').add({ senderUid: me.id, text: text.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        await db.collection('directMessages').doc(cid).set({ participants: [me.id, targetUid], lastMessageText: text.trim(), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastRead: { [me.id]: Date.now() } }, { merge: true });
        showAlert('Message sent to ' + displayName + '!');
    } catch(e) { showAlert('Failed: ' + e.message); }
};

async function deleteConversationAndMessages(convId) {
    const convRef  = db.collection('directMessages').doc(convId);
    const msgsSnap = await convRef.collection('msgs').get();
    if (!msgsSnap.empty) {
        let bref = db.batch(), cnt = 0;
        const jobs = [];
        msgsSnap.forEach(doc => {
            bref.delete(doc.ref); cnt++;
            if (cnt % 400 === 0) { jobs.push(bref.commit()); bref = db.batch(); cnt = 0; }
        });
        if (cnt > 0) jobs.push(bref.commit());
        await Promise.all(jobs);
    }
    await convRef.delete();
}

setTimeout(() => {
    closeModal('loading-modal');
}, 2100);
