from flask import g, Blueprint, send_from_directory, jsonify, current_app, request, send_file
import os
import base64
from dotenv import load_dotenv
import json
import subprocess

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

# @api_bp.route('/api/status', methods=['GET'])
# def get_status():
#     """Get system status - returns cached values"""
#     try:
#         with open('/tmp/system_status.json', 'r') as f:
#             status=json.load(f)
#     except FileNotFoundError:
#         status ={}
#     return jsonify(status)

# @api_bp.route('/api/pipeline-status')
# def get_pipeline_status():
#     date = request.args.get('date')
#     from .monitor import scan_processed_folder
#     pipeline_data = scan_processed_folder(date)
#     return jsonify(pipeline_data)

# @api_bp.route('/api/masterframe-status')
# def get_masterframe_status():
#     date = request.args.get('date')
#     print(date)
#     from .monitor import scan_masterframe_folder
#     masterframe_data = scan_masterframe_folder(date)
#     print(masterframe_data)
#     return jsonify(masterframe_data)

@api_bp.route('/api/text', methods=['GET'])
def get_text():
    # Get file path from request
    file_path = request.args.get('file_path')
    
    if not file_path:
        return jsonify({'error': 'Missing file_path parameter'}), 400
    
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Read file content
        with open(file_path, 'r') as file:
            content = file.read()
            
        # Detect file type and format response accordingly
        if file_path.endswith(".json"):
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
    date, unit, obj, filt, masterframe = param_set(request)

    images_list = link_to_images(date, unit=unit, obj=obj, filt=filt, masterframe=masterframe)

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
    
    try:
        filename = request.args.get("filename")
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
    except:
        try:
            from .monitor import link_to_images, param_set
            date, unit, obj, filt, masterframe = param_set(request)
            dtype = request.args.get("dtype")
            target = request.args.get("target")
            images_list = link_to_images(date, obj=obj, unit=unit, filt=filt, masterframe=masterframe)
            if len(images_list) == 0:
                return jsonify({
                        "success": False,
                        "error": "No images found"
                })
            else:
                for image in images_list:
                    if dtype == "bias":
                        if "master_bias.png" in image:
                            image_path = os.path.join(DATA_DIR, image)
                            break
                    elif dtype == "dark":
                        if f"master_dark_{target}.png" in image:
                            image_path = os.path.join(DATA_DIR, image)
                            break
                    elif dtype == "flat":
                        if f"master_flat_{target}.png" in image:
                            image_path = os.path.join(DATA_DIR, image)
                            break
                return send_file(image_path)

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
    # Get file path directly from request
    comments_file = request.args.get('file_path')
    
    if not comments_file:
        return jsonify({'error': 'Missing file_path parameter'}), 400
    
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
    try:
        date, unit, obj, filt, masterframe = param_set(request)

        obs_params = {
            'date': date,
            'obj': obj,
            'unit': unit,
            'filter': filt,
            'masterframe': bool(masterframe)
        }

        #np.save(f"/tmp/pipeline/request_{np.random.randint(0, 1000000)}.npy", obs_params)

        return jsonify({
            "success": True, 
            "message": "Pipeline rerun completed successfully"
        })

    except Exception as e:
        return jsonify({
            "success": False, 
            "error": str(e)
        }), 500
        
#for testing
@api_bp.route('/api/status', methods=['GET'])
def get_status():
    """Get system status - returns cached values"""
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        with open(SCRIPT_DIR + '/test/status.json', 'r') as f:
            status=json.load(f)
    except FileNotFoundError:
        status ={}
    return jsonify(status)

@api_bp.route('/api/pipeline-status')
def get_pipeline_status():
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    try:
        date = request.args.get('date')
        with open(SCRIPT_DIR + '/test/pipeline-status.json', 'r') as f:
            status=json.load(f)
    except FileNotFoundError:
        status ={}
    return jsonify(status)

@api_bp.route('/api/masterframe-status')
def get_masterframe_status():
    import os
    import json
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        with open(SCRIPT_DIR + '/test/masterframe-status.json', 'r') as f:
            status = json.load(f)
    except FileNotFoundError:
        status = []
    return jsonify(status)



@api_bp.route('/api/scheduler')
def get_scheduler_data():
    import os
    import json
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        with open(SCRIPT_DIR + '/test/scheduler.json', 'r') as f:
            status = json.load(f)
    except FileNotFoundError:
        status = []
    return jsonify(status)


# # @api_bp.route('/api/service-status')
# def get_service_status():
#     """
#     Returns the raw status string (e.g. "active", "inactive", "failed", etc.).
#     """

#     # out = subprocess.check_output(
#     #     ["systemctl", "is-active", 'pipeline-monitor.service'],
#     #     text=True,
#     # ).strip()
#     out = []
#     return out

# @api_bp.route('/api/service-log')
# def get_service_log():
#     log_file = '/var/log/pipeline-monitor.log'
#     try:   
#         with open(log_file, 'r') as file:
#             content = file.read()
            
#         return jsonify({'type': 'log', 'content': content})  # Return log as plain text

#     except Exception as e:
#         return jsonify({'error': str(e)}), 500


@api_bp.route('/api/plot', methods=['GET'])
def get_plot():
    import os
    import json
    from datetime import datetime
    
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    plot_type = request.args.get('type', 'bias')
    date_min = request.args.get('dateMin')
    date_max = request.args.get('dateMax')
    
    file_map = {
        'bias': SCRIPT_DIR + '/test/bias.json',
        'dark': SCRIPT_DIR + '/test/dark.json',
        'flat': SCRIPT_DIR + '/test/flat.json',
        'science': SCRIPT_DIR + '/test/science.json',
    }
    file = file_map.get(plot_type)
    if not file:
        return jsonify({'error': 'Invalid plot type'}), 400
    
    if not os.path.exists(file):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        with open(file, 'r') as f:
            data = json.load(f)
        
        # Handle case where data might be empty or have error message
        if not data or (isinstance(data, list) and len(data) > 0 and 'error' in data[0]):
            return jsonify({'error': 'No data available'}), 404
        
        # Filter by date range if provided
        if date_min or date_max:
            filtered_data = []
            for entry in data:
                # Determine date field based on plot type
                # For science, use date_obs; for masterframe (bias/dark/flat), use run_date
                if plot_type == 'science':
                    date_field = entry.get('date_obs')
                else:
                    date_field = entry.get('run_date')
                
                if not date_field:
                    continue
                
                # Parse date field and compare
                try:
                    # Handle both ISO format and date-only format
                    if 'T' in str(date_field) or ' ' in str(date_field):
                        entry_date = datetime.fromisoformat(str(date_field).replace('Z', '+00:00'))
                    else:
                        entry_date = datetime.strptime(str(date_field), '%Y-%m-%d')
                    
                    entry_date_str = entry_date.strftime('%Y-%m-%d')
                    
                    # Apply date filters
                    if date_min and entry_date_str < date_min:
                        continue
                    if date_max and entry_date_str > date_max:
                        continue
                    
                    filtered_data.append(entry)
                except (ValueError, TypeError) as e:
                    # If date parsing fails, skip this entry
                    continue
            
            return jsonify(filtered_data)
        
        # Return the raw JSON data directly if no date filtering
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/api/inst-log', methods=['GET', 'POST'])
def inst_log():
    import os
    import json
    
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    inst_log_file = SCRIPT_DIR + '/test/inst-log.json'
    
    if request.method == 'GET':
        try:
            if not os.path.exists(inst_log_file):
                return jsonify({'error': 'File not found'}), 404
            
            with open(inst_log_file, 'r') as f:
                data = json.load(f)
            
            return jsonify(data)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    else:  # POST
        try:
            data = request.json
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            # Ensure the directory exists
            os.makedirs(os.path.dirname(inst_log_file), exist_ok=True)
            
            # Write the JSON data to the file
            with open(inst_log_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            return jsonify({'success': True, 'message': 'inst-log.json updated successfully'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@api_bp.route('/api/qa-config', methods=['GET'])
def get_qa_config():
    """
    Get QA reference configuration files (masterframe.json or science.json)
    
    Query parameter:
    - type: 'masterframe' or 'science'
    
    Example:
    GET /api/qa-config?type=masterframe
    """
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        config_type = request.args.get('type')
        
        if not config_type:
            return jsonify({'error': 'Missing "type" query parameter (must be "masterframe" or "science")'}), 400
        
        if config_type not in ['masterframe', 'science']:
            return jsonify({'error': f'Invalid type "{config_type}". Must be "masterframe" or "science"'}), 400
        
        # Define the file path
        qa_ref_dir = SCRIPT_DIR + '/test'
        filename = f'{config_type}_config.json'
        file_path = os.path.join(qa_ref_dir, filename)
        
        # Read the configuration file
        try:
            if not os.path.exists(file_path):
                return jsonify({'error': f'Configuration file {filename} not found'}), 404
            
            with open(file_path, 'r') as f:
                config_data = json.load(f)
            
            return jsonify({
                'success': True,
                'type': config_type,
                'data': config_data
            })
        except IOError as e:
            return jsonify({'error': f'Failed to read file: {str(e)}'}), 500
        except json.JSONDecodeError as e:
            return jsonify({'error': f'Invalid JSON in file: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

