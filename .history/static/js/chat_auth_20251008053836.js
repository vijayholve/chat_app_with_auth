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

  // --- START: AUDIO RECORDING VARIABLES & SETUP ---
  const recordBtn = document.getElementById("recordBtn");
  const stopRecordBtn = document.getElementById("stopRecordBtn");
  const cancelRecordBtn = document.getElementById("cancelRecordBtn");
  const sendAudioBtn = document.getElementById("sendAudioBtn");
  const clearPreviewBtn = document.getElementById("clearPreviewBtn");

  const recordingState = document.getElementById("recordingState");
  const previewState = document.getElementById("previewState");
  const audioPreview = document.getElementById("audioPreview");
  const recordTimer = document.getElementById("recordTimer");
  const sendTextBtn = document.getElementById("sendTextBtn");
  const recordingInterface = document.getElementById("recordingInterface");

  let mediaRecorder;
  let audioChunks = [];
  let audioBlob = null;
  let recordingStream = null;
  let timerInterval = null;
  let recordingStartTime = 0;

  function updateTimer() {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
    recordTimer.textContent = `${minutes}:${seconds}`;
  }

  function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        recordingStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        
        mediaRecorder.onstop = () => {
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Use webm for broad support
          const audioUrl = URL.createObjectURL(audioBlob);
          audioPreview.src = audioUrl;
          showPreviewState();
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        showRecordingState();
      })
      .catch(err => {
        console.error("Microphone access denied or error:", err);
        alert("Microphone access failed. Please ensure your microphone is available.");
      });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      recordingStream.getTracks().forEach(track => track.stop());
      clearInterval(timerInterval);
    }
  }

  function cancelRecording() {
    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); // Stops, but we ignore the onstop event data
    }
    clearInterval(timerInterval);
    audioBlob = null;
    attachmentUrlInput.value = '';
    document.getElementById("preview").innerHTML = ""; // Clear image preview
    showInitialState();
  }

  function uploadAudio(blob) {
    const fd = new FormData();
    // Give the audio file a unique name, important for the backend
    const filename = `audio_message_${Date.now()}.webm`;
    fd.append('file', blob, filename);
    
    // Disable controls while uploading
    recordingInterface.querySelectorAll('button').forEach(btn => btn.disabled = true);
    
    fetch("/upload", { method: "POST", body: fd })
      .then(r => r.json())
      .then(j => {
        recordingInterface.querySelectorAll('button').forEach(btn => btn.disabled = false);
        if (j.error) return alert(j.error);
        
        // Populate attachment URL and submit the form
        attachmentUrlInput.value = j.url;
        messageForm.dispatchEvent(new Event('submit'));
        
        // Clean up UI after successful send (handled by form submit listener cleanup)
      })
      .catch(err => {
        recordingInterface.querySelectorAll('button').forEach(btn => btn.disabled = false);
        console.error(err);
        alert("Audio upload failed.");
      });
  }

  // UI State Handlers
  function showInitialState() {
    recordingState.style.display = 'none';
    previewState.style.display = 'none';
    recordBtn.style.display = 'inline-block';
    messageInput.style.display = 'inline-block';
    sendTextBtn.style.display = 'inline-block';
  }

  function showRecordingState() {
    recordingState.style.display = 'flex';
    previewState.style.display = 'none';
    recordBtn.style.display = 'none';
    messageInput.style.display = 'none';
    sendTextBtn.style.display = 'none';
  }

  function showPreviewState() {
    recordingState.style.display = 'none';
    previewState.style.display = 'flex';
    recordBtn.style.display = 'none';
    messageInput.style.display = 'none';
    sendTextBtn.style.display = 'none';
  }

  // Attach event listeners
  recordBtn.addEventListener('click', startRecording);
  stopRecordBtn.addEventListener('click', stopRecording);
  cancelRecordBtn.addEventListener('click', cancelRecording);
  clearPreviewBtn.addEventListener('click', cancelRecording); // Re-use cancel logic

  sendAudioBtn.addEventListener('click', () => {
    if (audioBlob) {
      uploadAudio(audioBlob);
    }
  });

  // --- END: AUDIO RECORDING VARIABLES & SETUP ---


// Utility to check if attachment is audio
  function isAudioAttachment(url) {
    if (!url) return false;
    const ext = url.split('.').pop().toLowerCase();
    // CRITICAL: Ensure 'webm' is included here.
    return ['mp3', 'ogg', 'wav', 'webm', 'm4a'].includes(ext);
  }

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
    
    // --- START: Updated Attachment Rendering ---
    if (m.attachment) {
      if (isAudioAttachment(m.attachment)) {
        // Render as Audio Player
        const audio = document.createElement("audio");
        audio.src = m.attachment;
        audio.controls = true;
        body.appendChild(audio);
      } else {
        // Render as Image (existing logic)
        const a = document.createElement("a");
        a.href = m.attachment;
        a.target = "_blank";
        const img = document.createElement("img");
        img.src = m.attachment;
        img.className = "preview-img";
        a.appendChild(img);
        body.appendChild(a);
      }
    }
    // Render text only if not just an attachment, OR if it's text *with* attachment
    if (m.text) {
        body.appendChild(document.createTextNode(m.text));
    } else if (!m.text && !m.attachment) {
        body.textContent = ''; // Ensure empty body if no content
    }
    // --- END: Updated Attachment Rendering ---
    
    el.appendChild(head);
    el.appendChild(body);
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
  // Upload flow (for images)
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

  // message send (unified logic for text, image, and audio)
  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const text = messageInput.value.trim();
    const attachment = attachmentUrlInput.value || null;
    
    if (!text && !attachment) return;
   
    // If an audio attachment is being sent, the UI state should be 'initial' or 'preview'
    // If it's a text/image message, the user clicks the SendTextBtn
    
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
    
    // Cleanup for all scenarios
    messageInput.value = "";
    attachmentUrlInput.value = "";
    audioBlob = null; 
    document.getElementById("preview").innerHTML = ""; // Clears image preview
    showInitialState(); // Resets audio controls
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

  socket.on("new_message", (m) => {
    appendMessage(m, m.sender === window.USERNAME);
  });

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
  
  // Initial UI state setup
  showInitialState(); 
})();