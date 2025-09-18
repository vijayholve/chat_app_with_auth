let localStream;
let peerConnection;
const socket = io();

// ICE servers (STUN server to traverse NAT)
const config = { 
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }] 
};

document.getElementById("callBtn").onclick = async () => {
  // Get microphone & camera
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;

  // Create peer connection
  peerConnection = new RTCPeerConnection(config);

  // Show remote stream
  peerConnection.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };

  // Add local tracks
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate);
    }
  };

  // Create offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send offer to server
  socket.emit("offer", offer);
};

// Handle offer
socket.on("offer", async (offer) => {
  peerConnection = new RTCPeerConnection(config);

  peerConnection.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) socket.emit("ice-candidate", event.candidate);
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer);
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Error adding ICE candidate", err);
  }
});

// Example when creating a call
socket.emit("offer", { offer: offer, room: currentRoom });

// On receiving an offer
socket.on("offer", async (data) => {
  const offer = data.offer;
  // ... setRemoteDescription(offer)
});

// When sending an answer
socket.emit("answer", { answer: answer, room: currentRoom });

// When sending ICE candidates
socket.emit("ice-candidate", { candidate: event.candidate, room: currentRoom });
