from flask import g, Blueprint, send_from_directory, jsonify, current_app, request, send_file
import os
import base64
from dotenv import load_dotenv
import json


load_dotenv()

api_bp = Blueprint('pipeline', __name__)

@api_bp.route('/')
def serve():
    return send_from_directory(current_app.static_folder, 'index.html')

# @api_bp.route('/<path:path>')
# def static_proxy(path):
#     return send_from_directory(current_app.static_folder, '/static/' + path)

def generate_nonce():
    g.nonce = base64.b64encode(os.urandom(16)).decode('utf-8')

@api_bp.after_request
def add_header(response):
    generate_nonce()
    nonce = g.nonce
    response.set_cookie(
        'key', 
        'value', 
        secure=True,        # HTTPS only
        httponly=True,      # Prevent JavaScript access
        samesite='Lax',     # Protect against CSRF
        max_age=3600        # Expire in 1 hour
    )
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = (
        f"default-src 'self'; "
        f"script-src 'self' 'unsafe-inline'; "  # Added unsafe-inline
        f"style-src 'self' 'unsafe-inline'; "   # Added unsafe-inline
        "img-src 'self' data: blob: *; "  # Allow images from any source and data/blob URLs
        "connect-src 'self' *; "  # Allow connections to any source
        "font-src 'self' data: *; "  # Allow fonts from any source
        "object-src 'none';"
    )

    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

@api_bp.route('/api/status', methods=['GET'])
def get_status():
    """Get system status - returns cached values"""
    try:
        with open('/tmp/system_status.json', 'r') as f:
            status=json.load(f)
    except FileNotFoundError:
        status ={}
    return jsonify(status)

@api_bp.route('/api/pipeline-status')
def get_pipeline_status():
    date = request.args.get('date')
    from .monitor import scan_processed_folder
    pipeline_data = scan_processed_folder("2025-01-01")
    return jsonify(pipeline_data)

@api_bp.route('/api/masterframe-status')
def get_masterframe_status():
    date = request.args.get('date')
    from .monitor import scan_masterframe_folder
    masterframe_data = scan_masterframe_folder("2025-01-01")
    return jsonify(masterframe_data)

@api_bp.route('/api/text', methods=['GET'])
def get_text():
    from .monitor import link_to_config, link_to_log, param_set
    date, gain, n_binning, obj, unit, filt, masterframe = param_set(request)
    dtype = request.args.get("dtype")
    
    try:
        if dtype == "config":
            filename = link_to_config(date, gain, n_binning, obj, unit, filt, masterframe)
        elif dtype == "log":
            filename, _ = link_to_log(date, gain, n_binning, obj, unit, filt, masterframe)
        elif dtype == "debug":
            _, filename = link_to_log(date, gain, n_binning, obj, unit, filt, masterframe)
        else:
            return jsonify({'error': 'Invalid dtype'}), 400
        
        if not os.path.exists(filename):
            return jsonify({'error': 'File not found'}), 404

        with open(filename, 'r') as file:
            content = file.read()
            
        # Detect file type and format response accordingly
        if filename.endswith(".json"):
            try:
                json_content = json.loads(content)  # Parse JSON
                return jsonify({'type': 'config', 'content': json_content})  # Return structured JSON
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid JSON format'}), 400
        else:
            return jsonify({'type': 'log', 'content': content})  # Return log as plain text

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/api/images')
def get_images():
    from .const import DATA_DIR
    from .monitor import link_to_images, param_set
    date, gain, n_binning, obj, unit, filt, masterframe = param_set(request)

    images_list = link_to_images(date, gain, n_binning, obj, unit, filt, masterframe)

    if len(images_list) == 0:
        return jsonify({
                "success": False,
                "error": "No images found"
        })
    else:
        names = []
        for image in images_list:
            image = image.replace(DATA_DIR, "")
            names.append(os.path.basename(image))
        return jsonify({
                "success": True,
                "images": images_list,
                "names": names
        })

@api_bp.route('/api/image')
def get_image():
    from .const import DATA_DIR
    filename = request.args.get("filename")
    
    """Serve an individual image by filename"""
    image_path = os.path.join(DATA_DIR, filename)
    try:
        if os.path.exists(image_path) and os.path.isfile(image_path):
            # Send the file directly to the client
            return send_file(image_path)
        else:
            return jsonify({
                "success": False,
                "error": "Image not found"
            }), 404
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@api_bp.route('/api/comments', methods=["GET", "POST"])
def get_comments():
    """Handle GET and POST requests for comments.
    
    GET: Retrieve comments for a specific pipeline entry.
    POST: Add a new comment to the comments file.
    """
    from .monitor import link_to_comments, param_set
    
    date, gain, n_binning, obj, unit, filt, masterframe = param_set(request)
    
    comments_file = link_to_comments(date, gain, n_binning, obj, unit, filt, masterframe=masterframe)
    if request.method == "POST":
        # Handle adding a new comment
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        comment = {
            "author": data["author"],
            "datetime": data["datetime"],  # Keep consistent with frontend
            "text": data["comment"]
        }

        # Ensure the directory exists
        os.makedirs(os.path.dirname(comments_file), exist_ok=True)

        # Append the comment to the file
        try:
            with open(comments_file, "a") as f:
                f.write(f"{comment['author']}|{comment['datetime']}|{comment['text']}\n")
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": f"Failed to write comment: {str(e)}"}), 500

    else:  # GET request
        # Retrieve existing comments
        comments = []
        try:
            with open(comments_file, "r") as f:
                for line in f:
                    # Split the line, ensuring it has exactly 3 parts
                    parts = line.strip().split("|", 2)
                    if len(parts) != 3:
                        continue  # Skip malformed lines
                    author, datetime, text = parts
                    comments.append({"author": author, "datetime": datetime, "text": text})
        except FileNotFoundError:
            pass  # Return empty list if file doesn't exist
        
        return jsonify({'comments': comments})

@api_bp.route('/api/rerun', methods=["POST"])
def rerun_pipeline():
    from .monitor import param_set
    import numpy as np
    try:
        date, gain, n_binning, obj, unit, filt, masterframe = param_set(request)

        obs_params = {
            'date': date,
            'obj': obj,
            'unit': unit,
            'filter': filt,
            'gain': int(gain),
            'n_binning': int(n_binning),
            'masterframe': bool(masterframe)
        }

        np.save(f"/tmp/pipeline/request_{np.random.randint(0, 1000000)}.npy", obs_params)

        return jsonify({
            "success": True, 
            "message": "Pipeline rerun completed successfully"
        })

    except Exception as e:
        return jsonify({
            "success": False, 
            "error": str(e)
        }), 500

# for testing
# @api_bp.route('/api/status', methods=['GET'])
# def get_status():
#     """Get system status - returns cached values"""
#     try:
#         with open(SCRIPT_DIR + '/test/status.json', 'r') as f:
#             status=json.load(f)
#     except FileNotFoundError:
#         status ={}
#     return jsonify(status)

# @api_bp.route('/api/pipeline-status')
# def get_pipeline_status():
#     try:
#         date = request.args.get('date')
#         with open(SCRIPT_DIR + '/test/pipeline-status.json', 'r') as f:
#             status=json.load(f)
#     except FileNotFoundError:
#         status ={}
#     return jsonify(status)

# @api_bp.route('/api/masterframe-status')
# def get_masterframe_status():
#     try:
#         date = request.args.get('date')
#         with open(SCRIPT_DIR + '/test/masterframe-status.json', 'r') as f:
#             status=json.load(f)
#     except FileNotFoundError:
#         status ={}
#     return jsonify(status)

