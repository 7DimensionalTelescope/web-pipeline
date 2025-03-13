from flask import g, Blueprint, send_from_directory, jsonify
import os
import base64

from dotenv import load_dotenv

import subprocess
import psutil

import platform

load_dotenv()

api_bp = Blueprint('api', __name__, static_folder='../../frontend/build')

DATA_FOLDER = os.getenv('DATA_FOLDER', './data')

@api_bp.route('/')
def serve():
    return send_from_directory(api_bp.static_folder, 'index.html')

@api_bp.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(api_bp.static_folder, path)

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

def get_cpu_info():
    try:
        cores = psutil.cpu_count()
        # Try to get CPU model information
        cpu_info = "Unknown"
        if platform.system() == "Linux":
            try:
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            cpu_info = line.split(":")[1].strip()
                            break
            except:
                pass
        elif platform.system() == "Windows":
            cpu_info = platform.processor()
        elif platform.system() == "Darwin":  # macOS
            cpu_info = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"]).decode().strip()
        
        return cores, cpu_info
    except Exception as e:
        print(f"Error getting CPU info: {e}")
        return None, None

def get_gpu_info():
    try:
        # Get detailed GPU information
        gpu_info = []
        
        # Get memory usage
        output = subprocess.check_output(['nvidia-smi', '--query-gpu=index,memory.used,memory.total,name,temperature.gpu,utilization.gpu', 
                                         '--format=csv,noheader,nounits'])
        
        for line in output.decode().strip().split('\n'):
            if line:
                parts = [part.strip() for part in line.split(',')]
                if len(parts) >= 6:
                    gpu_info.append({
                        'index': int(parts[0]),
                        'used': int(parts[1]),
                        'total': int(parts[2]),
                        'name': parts[3],
                        'temperature': int(parts[4]),
                        'utilization': int(parts[5])
                    })
                else:
                    # Fallback for older nvidia-smi versions
                    gpu_info.append({
                        'used': int(parts[0]) if len(parts) > 0 else 0,
                        'total': int(parts[1]) if len(parts) > 1 else 0
                    })
                    
        return gpu_info
    except Exception as e:
        print(f"Error getting GPU info: {e}")
        # Return empty list if no GPU or nvidia-smi not available
        return []

@api_bp.route('/status', methods=['GET'])
def get_status():
    # Get CPU information
    cpu_cores, cpu_model = get_cpu_info()
    
    status = {
        'cpu_percent': psutil.cpu_percent(interval=0.5),
        'cpu_cores': cpu_cores,
        'cpu_info': cpu_model,
        'memory': {
            'total': psutil.virtual_memory().total,
            'used': psutil.virtual_memory().used,
            'percent': psutil.virtual_memory().percent
        },
        'disk': {
            'total': psutil.disk_usage('/').total,
            'free': psutil.disk_usage('/').free,
            'percent': psutil.disk_usage('/').percent
        },
        'gpu': get_gpu_info()
    }
    
    return jsonify(status)