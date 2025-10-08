// Client-side chat logic with attachments and auth
(() => {
  const socket = io();

  let currentRoom = "global";
  const currentRoomDiv = document.getElementById("currentRoom");
  const messagesDiv = document.getElementById("messages");
  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  const attachmentUrlInput = document.getElementById("attachmentUrl");
  const typingIndicator = document.getElementById("typingIndicator");

  function appendMessage(m, isOwn = false) {
    const el = document.createElement("div");
    el.className = "msg" + (isOwn ? " own" : "");
    el.dataset.msgId = m.id;
    const head = document.createElement("div");
    head.className = "head";
    head.textContent = `${m.sender} • ${new Date(
      m.timestamp
    ).toLocaleString()}`;
    if (isOwn) {
      const delBtn = document.createElement("span");
      delBtn.className = "delete-btn";
      delBtn.title = "Delete message";
      delBtn.textContent = "🗑️";
      delBtn.style.cursor = "pointer";
      delBtn.style.marginLeft = "10px";
      delBtn.onclick = function (e) {
        e.stopPropagation();
        // if (!confirm("Delete this message?")) return;
        fetch(`/delete_message/${m.id}`, { method: "POST" })
          .then((r) => r.json())
          .then((j) => {
            if (j.success) {
              el.remove();
            } else {
              alert(j.error || "Delete failed");
            }
          });
      };
      head.appendChild(delBtn);
    }
    const body = document.createElement("div");
    body.className = "body";
    if (m.text) body.textContent = m.text;
    if (m.attachment) {
      const a = document.createElement("a");
      a.href = m.attachment;
      a.target = "_blank";
      const img = document.createElement("img");
      img.src = m.attachment;
      img.className = "preview-img";
      a.appendChild(img);
      body.appendChild(a);
    }
    el.appendChild(head);
    el.appendChild(body);
    // reactions container
    const reactWrap = document.createElement('div');
    reactWrap.className = 'reactions';
    // render existing reactions
    const reactions = m.reactions || {};
    function renderReactions() {
      reactWrap.innerHTML = '';
      // common emojis to show as quick react options
      const quick = ['👍','❤️','😂','😮','😢','🎉'];
      quick.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'react-btn';
        btn.textContent = emoji + (reactions[emoji] ? ' ' + reactions[emoji].length : '');
        btn.onclick = (ev) => {
          ev.stopPropagation();
          socket.emit('toggle_reaction', { msg_id: m.id, emoji });
        };
        reactWrap.appendChild(btn);
      });
      // show custom reactions (others)
      Object.keys(reactions).forEach(e => {
        if (quick.indexOf(e) === -1) {
          const span = document.createElement('span');
          span.className = 'react-summary';
          span.textContent = `${e} ${reactions[e].length}`;
          reactWrap.appendChild(span);
        }
      });
    }
    renderReactions();
    el.appendChild(reactWrap);
    messagesDiv.appendChild(el);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function loadHistory(room) {
    fetch(`/history?room=${encodeURIComponent(room)}&limit=200`)
      .then((r) => r.json())
      .then((arr) => {
        messagesDiv.innerHTML = "";
        arr.forEach((m) =>
          appendMessage(m, m.sender === (window.USERNAME || ""))
        );
      })
      .catch((err) => console.error("history err", err));
  }

  // handle room buttons: update room name and load messages
  document.querySelectorAll(".roomBtn").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const form = this.closest("form");
      const room = form.querySelector('input[name="room"]').value;
      currentRoom = room;
      currentRoomDiv.textContent = "Room: " + room;
      loadHistory(room);
      // Optionally, emit join event if using socketio for room switching
      socket.emit("join", { room });
    });
  });
  // Upload flow
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");
  const previewDiv = document.getElementById("preview");

  uploadBtn.addEventListener("click", () => {
    const f = fileInput.files[0];
    if (!f) return alert("Choose a file");
    const fd = new FormData();
    fd.append("file", f);
    uploadBtn.disabled = true;
    fetch("/upload", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((j) => {
        uploadBtn.disabled = false;
        if (j.error) return alert(j.error);
        attachmentUrlInput.value = j.url;
        previewDiv.innerHTML = "";
        const img = document.createElement("img");
        img.src = j.url;
        img.className = "preview-img";
        previewDiv.appendChild(img);
      })
      .catch((err) => {
        uploadBtn.disabled = false;
        console.error(err);
        alert("Upload failed");
      });
  });

  // message send
  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const attachment = attachmentUrlInput.value || null;
    if (!text && !attachment) return;
    socket.emit("send_message", { room: currentRoom, text, attachment });
    // optimistic UI
    appendMessage(
      {
        sender: window.USERNAME || "Me",
        text,
        attachment,
        timestamp: new Date().toISOString(),
      },
      true
    );
    messageInput.value = "";
    attachmentUrlInput.value = "";
    document.getElementById("preview").innerHTML = "";
  });

  // socket events
  socket.on("connected", (d) => {
    // server tells username
    if (d && d.username) {
      window.USERNAME = d.username;
    }
    // auto-join default room
    socket.emit("join", { room: currentRoom });
    loadHistory(currentRoom);
  });

  // socket.on("new_message", (m) => {
  //   appendMessage(m, m.sender === window.USERNAME);
  // });

  // Listen for delete_message event from server
  socket.on("delete_message", (data) => {
    const msgId = data.id;
    const msgEl = document.querySelector(`.msg[data-msg-id='${msgId}']`);
    if (msgEl) msgEl.remove();
  });

  socket.on("user_typing", (d) => {
    if (d.room !== currentRoom) return;
    typingIndicator.textContent = d.typing ? d.username + " is typing..." : "";
  });

  // typing events
  let typingTimer = null;
  const TYPING_TIMEOUT = 1200;
  messageInput.addEventListener("input", () => {
    socket.emit("typing", { room: currentRoom, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(
      () => socket.emit("typing", { room: currentRoom, typing: false }),
      TYPING_TIMEOUT
    );
  });

  // initial load
  // username is set by server on connect event
})();
