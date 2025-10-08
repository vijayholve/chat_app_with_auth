# Edit and delete routes for Room 
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_socketio import SocketIO, emit, join_room, leave_room
from flasgger import Swagger
from datetime import datetime, timedelta # IMPORT timedelta

app = Flask(__name__)
# app = Flask(__name__)
# Define file paths and configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
DB_PATH = os.path.join(BASE_DIR, "chat.db")
# app.py
# ... (near allowed_filename function)
ALLOWED_EXT = {'png','jpg','jpeg','gif','webp', 'mp3', 'ogg', 'wav', 'm4a'}
# ...
# Configure the Flask app
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_secret_key')
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{DB_PATH}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 8MB max upload

# Initialize extensions
swagger = Swagger(app)
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')
login_manager = LoginManager(app)

# Configure login manager
login_manager.login_view = 'login'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
@app.route('/edit_room/<int:room_id>', methods=['GET', 'POST'])
@login_required
def edit_room(room_id):
    room = Room.query.get_or_404(room_id)
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        private = bool(request.form.get('private'))
        if name:
            room.name = name
        room.private = private
        db.session.commit()
        flash('Room updated', 'success')
        return redirect(url_for('dashboard'))
    return render_template('edit_room.html', room=room)

@app.route('/delete_room/<int:room_id>')
@login_required
def delete_room(room_id):
    room = Room.query.get_or_404(room_id)
    db.session.delete(room)
    db.session.commit()
    flash('Room deleted', 'info')
    return redirect(url_for('dashboard'))

# Edit and delete routes for User
@app.route('/edit_user/<int:user_id>', methods=['GET', 'POST'])
@login_required
def edit_user(user_id):
    user = User.query.get_or_404(user_id)
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        if username:
            user.username = username
        db.session.commit()
        flash('User updated', 'success')
        return redirect(url_for('dashboard'))
    return render_template('edit_user.html', user=user)

@app.route('/delete_user/<int:user_id>')
@login_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    flash('User deleted', 'info')
    return redirect(url_for('dashboard'))
# Dashboard route
@app.route('/dashboard')
@login_required
def dashboard():
    rooms = Room.query.all()
    users = User.query.all()
    return render_template('dashboard.html', rooms=rooms, users=users)



# Models

@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Upload an image file
    ---
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
    responses:
      200:
        description: File uploaded successfully
    """
    # your upload logic...

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(140), nullable=True, default="Available")
    status_timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False, index=True)
    private = db.Column(db.Boolean, default=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

class RoomMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room = db.Column(db.String(120), nullable=False, index=True)
    sender = db.Column(db.String(80), nullable=False)
    text = db.Column(db.Text, nullable=True)
    attachment = db.Column(db.String(300), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    read = db.Column(db.Boolean, default=False)

    def serialize(self):
        return {
            "id": self.id,
            "room": self.room,
            "sender": self.sender,
            "text": self.text,
            "attachment": self.attachment,
            "timestamp": self.timestamp.isoformat() + "Z",
            "read": bool(self.read),
        }

with app.app_context():
    db.create_all()
    # ensure a default public room exists
    if not Room.query.filter_by(name='global').first():
        r = Room(name='global', private=False)
        db.session.add(r)
        db.session.commit()

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Routes
@app.route('/')
@login_required
def index():
    rooms = Room.query.all()
    # Fetch all users who have set a status. We look back up to 7 days.
    time_limit = datetime.utcnow() - timedelta(days=7)
    users_with_status = db.session.query(User).filter(
        (User.status != None) | (User.status_timestamp >= time_limit)
    ).order_by(User.status_timestamp.desc()).all()
    
    # Filter out the current user for the 'Recent User Statuses' list
    users_for_status_list = [u for u in users_with_status if u.id != current_user.id]

    return render_template('index.html', 
        rooms=rooms, 
        users_with_status=users_for_status_list, 
        current_user=current_user)
# --- START: New Set Status Route ---

# --- START: New Set Status Route ---
@app.route('/set_status', methods=['POST'])
@login_required
def set_status():
    new_status = request.form.get('new_status', '').strip()
    
    if len(new_status) > 140:
        flash('Status must be less than 140 characters.', 'danger')
        return redirect(url_for('index'))
    
    current_user.status = new_status
    current_user.status_timestamp = datetime.utcnow()
    db.session.commit()
    
    flash('Status updated successfully!', 'success')
    
    # Optional: Emit a WebSocket event to instantly update everyone's sidebar status list
    # socketio.emit('status_update', {
    #     'username': current_user.username,
    #     'status': current_user.status,
    #     'timestamp': current_user.status_timestamp.isoformat() + 'Z'
    # }, broadcast=True)
    
    return redirect(url_for('index'))
# --- END: New Set Status Route ---

@app.route('/register', methods=['GET','POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username','').strip()
        password = request.form.get('password','')
        if not username or not password:
            flash('Username and password required', 'danger')
            return redirect(url_for('register'))
        if User.query.filter_by(username=username).first():
            flash('Username already taken', 'danger')
            return redirect(url_for('register'))
        u = User(username=username)
        u.set_password(password)
        u.status = "Just joined the chat!" 
        u.status_timestamp = datetime.utcnow()
        db.session.add(u)
        db.session.commit()
        login_user(u)
        flash('Registered and logged in', 'success')
        return redirect(url_for('index'))
    return render_template('register.html')

@app.route('/login', methods=['GET','POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username','').strip()
        password = request.form.get('password','')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flash('Logged in', 'success')
            return redirect(url_for('index'))
        flash('Invalid credentials', 'danger')
        return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out', 'info')
    return redirect(url_for('login'))

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    # serve uploads (in production use a proper static file server)
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=False)

@app.route('/create_room', methods=['POST'])
@login_required
def create_room():
    name = request.form.get('room_name','').strip()
    private = bool(request.form.get('private'))
    if not name:
        flash('Room name required', 'danger')
        return redirect(url_for('index'))
    if Room.query.filter_by(name=name).first():
        flash('Room already exists', 'danger')
        return redirect(url_for('index'))
    r = Room(name=name, private=private, owner_id=current_user.id)
    db.session.add(r)
    db.session.commit()
    # add creator as member
    m = RoomMember(room_id=r.id, user_id=current_user.id)
    db.session.add(m)
    db.session.commit()
    flash('Room created', 'success')
    return redirect(url_for('index'))
@app.route("/delete_message/<int:msg_id>", methods=["POST"])
@login_required
def delete_message(msg_id):
    try:
        msg = Message.query.get_or_404(msg_id)

        # Allow only message owner to delete
       
        db.session.delete(msg)
        db.session.commit()

        socketio.emit("delete_message", {"id": msg_id}, room=msg.room)
        return {"success": True}, 200
    except Exception as e:
        import traceback
        print('Error in delete_message:', e)
        traceback.print_exc()
        return {"error": "Internal server error", "details": str(e)}, 500

@app.route('/join_room', methods=['POST'])
@login_required
def join_room_route():
    room_name = request.form.get('room','').strip()
    r = Room.query.filter_by(name=room_name).first()
    if not r:
        flash('Room not found', 'danger')
        return redirect(url_for('index'))
    if r.private:
        # check membership
        member = RoomMember.query.filter_by(room_id=r.id, user_id=current_user.id).first()
        if not member:
            flash('Private room — you must be invited or the owner must add you', 'danger')
            return redirect(url_for('index'))
    else:
        # ensure membership for public room
        if not RoomMember.query.filter_by(room_id=r.id, user_id=current_user.id).first():
            db.session.add(RoomMember(room_id=r.id, user_id=current_user.id))
            db.session.commit()
    flash(f'Joined {room_name}', 'success')
    return redirect(url_for('index'))


@app.route('/history')
@login_required
def history():
    room = request.args.get('room','global')
    limit = int(request.args.get('limit', 200))
    msgs = Message.query.filter_by(room=room).order_by(Message.id.desc()).limit(limit).all()
    return jsonify([m.serialize() for m in reversed(msgs)])

# upload endpoint
ALLOWED_EXT = {'png','jpg','jpeg','gif','webp', 'mp3', 'ogg', 'wav', 'm4a', 'webm'} 
def allowed_filename(fname):
    ext = fname.rsplit('.',1)[-1].lower() if '.' in fname else ''
    return ext in ALLOWED_EXT
@app.route('/upload', methods=['POST'])
@login_required
def upload():
    if 'file' not in request.files:
        return jsonify({"error":"no file"}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({"error":"empty filename"}), 400
    if not allowed_filename(f.filename):
        return jsonify({"error":"invalid file type"}), 400
    filename = secure_filename(f.filename)
    # avoid collisions
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
    filename = f"{timestamp}_{filename}"
    path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    f.save(path)
    url = url_for('uploaded_file', filename=filename)
    return jsonify({"url": url})

# mark read (REST)
@app.route('/mark_read', methods=['POST'])
@login_required
def mark_read():
    data = request.get_json() or {}
    room = data.get('room')
    if not room:
        return jsonify({"error":"room required"}), 400
    msgs = Message.query.filter(Message.room==room, Message.sender!=current_user.username, Message.read==False).all()
    for m in msgs:
        m.read = True
    db.session.commit()
    return jsonify({"ok":True, "count": len(msgs)})

# Socket events
@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        emit('connected', {'msg':'connected', 'username': current_user.username})

@socketio.on('join')
def handle_join(data):
    room = data.get('room','global')
    # enforce private room membership
    r = Room.query.filter_by(name=room).first()
    if r and r.private:
        member = RoomMember.query.filter_by(room_id=r.id, user_id=current_user.id).first()
        if not member:
            emit('error', {'msg':'access denied to private room'})
            return
    join_room(room)
    emit('user_joined', {'room': room, 'username': current_user.username}, room=room, include_self=False)

@socketio.on('send_message')
def handle_send_message(data):
    room = data.get('room','global')
    text = data.get('text','').strip()
    attachment = data.get('attachment')  
    if not text and not attachment:
        return
   
    r = Room.query.filter_by(name=room).first()
    if r and r.private:
        member = RoomMember.query.filter_by(room_id=r.id, user_id=current_user.id).first()
        if not member:
            emit('error', {'msg':'access denied to private room'})
            return
    msg = Message(room=room, sender=current_user.username, text=text if text else None, attachment=attachment)
    db.session.add(msg)
    db.session.commit()
    payload = msg.serialize()
    emit('new_message', payload, room=room)

@socketio.on('typing')
def handle_typing(data):
    room = data.get('room','global')
    is_typing = bool(data.get('typing', False))
    # just broadcast typing to other members in room
    emit('user_typing', {'room': room, 'username': current_user.username, 'typing': is_typing}, room=room, include_self=False)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)

@socketio.on("offer")
def handle_offer(offer):
    emit("offer", offer, broadcast=True, include_self=False)

@socketio.on("answer")
def handle_answer(answer):
    emit("answer", answer, broadcast=True, include_self=False)
# -----------------------------
# END CALL SOCKET EVENT
# -----------------------------
@socketio.on("end_call")
def handle_end_call(data):
    room = data.get("room")
    emit("end_call", {}, room=room, include_self=False)


@socketio.on("ice-candidate")
def handle_candidate(candidate):
    emit("ice-candidate", candidate, broadcast=True, include_self=False)
@socketio.on("offer")
def handle_offer(data):
    room = data.get("room")
    offer = data.get("offer")
    emit("offer", {"offer": offer}, room=room, include_self=False)

@socketio.on("answer")
def handle_answer(data):
    room = data.get("room")
    answer = data.get("answer")
    emit("answer", {"answer": answer}, room=room, include_self=False)

@socketio.on("ice-candidate")
def handle_candidate(data):
    room = data.get("room")
    candidate = data.get("candidate")
    emit("ice-candidate", {"candidate": candidate}, room=room, include_self=False)
