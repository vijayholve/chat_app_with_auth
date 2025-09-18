Chat App with Authentication, Secure Rooms, and Image Attachments
---------------------------------------------------------------

Run locally:
1. Copy .env.example to .env and set SECRET_KEY.
2. Create virtualenv and install requirements:
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

3. Run:
   python app.py

Or with Docker:
   docker build -t chatapp .
   docker-compose up -d

Notes:
- Default public room 'global' exists.
- Private rooms can be created and will require invite (creator is auto-member).
- Uploads are stored in the uploads/ folder and served by Flask in development.
