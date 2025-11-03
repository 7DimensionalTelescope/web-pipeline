"""
Utility functions for the web pipeline backend.
Contains helper functions that were previously in monitor.py or routes.py.
"""

import os
from .database import db_connection
from .const import DATA_DIR


def get_request_params(request):
    """Extract parameters from request - replaces param_set from monitor.py"""
    date = request.args.get("date")
    
    masterframe = request.args.get("masterframe")
    if isinstance(masterframe, str):
        masterframe = masterframe.lower() == 'true'
    elif not isinstance(masterframe, bool):
        masterframe = False
        
    if masterframe:
        unit = request.args.get("unit")
        return date, unit, None, None, masterframe
    else:
        obj = request.args.get("obj")
        filt = request.args.get("filt")
        return date, None, obj, filt, masterframe


def get_file_paths_from_db(date, unit=None, obj=None, filt=None, masterframe=False):
    """Get file paths from database - replaces link_to_files from monitor.py"""
    if not db_connection.is_connected:
        return None, None, None, None
    
    try:
        pipeline_data = db_connection.get_pipeline_data(
            date, 
            masterframe=masterframe, 
            unit=unit if masterframe else None,
            obj=obj if not masterframe else None,
            filt=filt if not masterframe else None
        )
        
        if pipeline_data:
            record = pipeline_data[0]
            config_file = record.get('config_file', '')
            if config_file:
                config_file = os.path.join(DATA_DIR, config_file)
            return (
                config_file,
                record.get('log_file', ''),
                record.get('debug_file', ''),
                record.get('comments_file', '')
            )
    except Exception as e:
        print(f"Error getting file paths from database: {e}")
    
    return None, None, None, None


def link_to_images(date, obj=None, unit=None, filt=None, masterframe=False):
    import glob
    from .const import MASTERFRAME_DIR, DATA_DIR
    from pathlib import Path
    
    if masterframe:
        base_folder = Path(MASTERFRAME_DIR)
    else:
        base_folder = Path(DATA_DIR)

    base_folder = os.path.join(base_folder, date)

    if masterframe:
        if unit:
            base_folder = os.path.join(base_folder, unit)
    else:
        if obj and filt:
            base_folder = os.path.join(base_folder, obj, filt)

    images_path = os.path.join(base_folder, "figures")
    if os.path.exists(images_path):
        images = glob.glob(images_path + "/*.jpg")
    else:
        images = []
    return images