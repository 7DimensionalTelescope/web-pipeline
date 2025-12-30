import glob
from pathlib import Path
import yaml
import os
import re

from .const import *

def scan_processed_folder(date):
    # Find the base folder and metadata
    idx = 1
    output = []
    base = base_folder(date)
    for folder in Path(base).iterdir():
        if not(folder.is_dir()):
            continue
        for f in folder.iterdir():
            row_dict={
                "id": idx,
                "date": date,
                "obj": folder.stem,
                "filt": f.stem,
                "masterframe": False,
            }
            config_file, log_file, _, comments_file = link_to_files(date, obj=row_dict["obj"], filt = row_dict["filt"])
            

            with open(config_file, "r") as f:
                config = yaml.load(f, Loader=yaml.FullLoader)
            
            pro = sum(config["flag"].values())
            tot = len(PROCEDURE)
            progress = pro/tot
            row_dict["status"]  = "completed" if pro == tot else PROCEDURE[pro-1]
            
            if log_file:
                row_dict["warnings"], row_dict["errors"] = count_warnings_errors(log_file)
            else:
                row_dict["warnings"] = 0
                row_dict["errors"] = 0

            os.makedirs(os.path.dirname(comments_file), exist_ok=True)
            if comments_file:
                row_dict["comments"] = count_comments(comments_file)
            else:
                row_dict["comments"] = 0
            output.append(row_dict)
            idx+=1

    return output


def scan_masterframe_folder(date):
    output = []
    base = base_folder(date, masterframe=True)
    for folder in Path(base).iterdir():
        
        row_dict = {
            "date": date,
            "unit": folder.name,
            "bias": False,
            "dark": set(),
            "flat": set(),
            "masterframe": True
        }
        for file in folder.iterdir():
            file_name = file.name
            if "bias_" in file_name:
                row_dict["bias"] = True
            elif "dark_" in file_name:
                row_dict["dark"].add(file_name.split("_")[1])
            elif "flat_" in file_name:
                row_dict["flat"].add(file_name.split("_")[1])

        row_dict["flat"] = list(row_dict["flat"]) if row_dict["flat"] else False
        row_dict["dark"] = list(row_dict["dark"]) if row_dict["dark"] else False

        _, log_file, _, comments_file = link_to_files(date, unit=row_dict["unit"], masterframe = True)

        if log_file:
            row_dict["warnings"], row_dict["errors"] = count_warnings_errors(log_file)
        else:
            row_dict["warnings"] = 0
            row_dict["errors"] = 0

        
        os.makedirs(os.path.dirname(comments_file), exist_ok=True)
        if comments_file:
            row_dict["comments"] = count_comments(comments_file)
        else:
            row_dict["comments"] = 0

        output.append(row_dict)
    
    return output

def param_set(request):
    date = request.args.get("date")
    
    masterframe = request.args.get("masterframe")

    if type(masterframe) == str:
        masterframe = masterframe.lower() == 'true'
    elif type(masterframe) != bool:
        masterframe = False
        print("masterframe is not a boolean, setting to False")
        
    if masterframe:
        unit = request.args.get("unit")
        return date, unit, None, None, masterframe
    else:
        obj = request.args.get("obj")
        filt = request.args.get("filt")
        return date, None, obj, filt, masterframe

def base_folder(date, obj=None, unit=None, filt=None, masterframe=False):
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

    return base_folder


def link_to_files(date, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, obj=obj, filt=filt)

    if masterframe:
        config = os.path.join(obs_path,f"{date}_{unit}.yml")
        log = os.path.join(obs_path,f"{date}_{unit}.log")
        debug = os.path.join(obs_path, f"{date}_{unit}_debug.log")
        comments = os.path.join(obs_path, f"{date}_{unit}_comments.txt")
        
        if not(os.path.exists(log)):
            log = None
        
        return config, log, debug, comments
    else:
        config = glob.glob(f"{obs_path}/{obj}_{filt}*.yml")[0]
        basename = os.path.basename(config)
        basename = basename.replace(".yml", "")
        log = f"{obs_path}/{basename}.log"
        debug = f"{obs_path}/{basename}_debug.log"
        comments = f"{obs_path}/{basename}_comments.txt"

        return config, log, debug, comments

def link_to_images(date, gain, n_binning, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, gain, n_binning, obj, unit, filt, masterframe)
    images_path = os.path.join(obs_path, "images")
    if os.path.exists(images_path):
        images = glob.glob(images_path + "/*.png")
    else:
        images = []
    return images

def count_warnings_errors(log_file):
    warning_count = 0
    error_count = 0
    if os.path.exists(log_file):
        with open(log_file, 'r') as file:
            for line in file:
                if re.search(r'\[WARNING\]', line):
                    warning_count += 1
                elif re.search(r'\[ERROR\]', line):
                    error_count += 1
    return warning_count, error_count

def count_comments(comments_file):
    count = 0
    if os.path.exists(comments_file):
        with open(comments_file, 'r') as file:
            for line in file:
                count += 1
    return count


def get_plot_data(file):
    import json
    import os
    if not os.path.exists(file):
        return None, 'File not found'
    try:
        with open(file, 'r') as f:
            data = json.load(f)
        
        # Handle case where data might be empty or have error message
        if not data or (isinstance(data, list) and len(data) > 0 and 'error' in data[0]):
            return None, 'No data available'
        
        unit_list = []
        plot_data = {}
        
        for entry in data:
            filename = entry.get('filename', '')
            # Extract telescope unit from filename (e.g., "7DT13" from "dark_100s_7DT13_20250215_1x1_gain2750_C31234.fits")
            if '_' in filename:
                parts = filename.split('_')
                if len(parts) >= 3:
                    unit = parts[2]  # e.g., "7DT13"
                    if unit not in unit_list:
                        unit_list.append(unit)
                    
                    if unit not in plot_data:
                        plot_data[unit] = {
                            'dates': [],
                            'clipmed': [],
                            'clipstd': [],
                            'filters': []
                        }
                    
                    # Extract date from filename (e.g., "20250215" from "dark_100s_7DT13_20250215_1x1_gain2750_C31234.fits")
                    date_part = parts[3] if len(parts) > 3 else ''
                    if len(date_part) == 8:  # YYYYMMDD format
                        formatted_date = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}"
                        plot_data[unit]['dates'].append(formatted_date)
                        
                        # Get plot values from JSON data
                        clipmed = entry.get('clipmed', 0)
                        clipstd = entry.get('clipstd', 0)
                        filter_name = entry.get('filter', '')
                        
                        plot_data[unit]['clipmed'].append(clipmed)
                        plot_data[unit]['clipstd'].append(clipstd)
                        plot_data[unit]['filters'].append(filter_name)
        
        unit_list = sorted(unit_list)
        return {'units': unit_list, 'plot_data': plot_data}, None
    except Exception as e:
        return None, str(e)

        

def update_masterframe_data():
    base = "/lyman/data2/master_frame"

    data = {"bias": [], "dark": [], "flat": []}
    bpmask = []
    
    for folder in Path(base).iterdir():
        if folder.stem.startswith("_"):
            continue
        for f in folder.iterdir():
            if f.stem.startswith("_"):
                continue
            for dtype in ["bias", "dark", "flat", "bpmask"]:                    
                if dtype == "dark" or dtype=="bpmask":
                    file = glob.glob(str(f.absolute())+f"/{dtype}_100s_*.fits")
                else:
                    file = glob.glob(str(f.absolute())+f"/{dtype}_*.fits")
                
                try:
                    if file:

                        if dtype == "bpmask":
                            header = fits.getheader(file[0], ext=1)
                            bpmask.append([folder.stem, f.stem, dtype, header["NHOTPIX"], header["NAXIS1"]*header["NAXIS2"]])
                        else:
                            header = fits.getheader(file[0])
                            data[dtype].append([folder.stem, f.stem, dtype, header["FILTER"], header["CLIPMED"], header["CLIPSTD"]])
                except:
                    continue
    
    for dtype in ["bias", "dark", "flat", "bpmask"]:     
        if dtype == "bpmask":
            tbl = Table(rows=bpmask,
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "NHOTPIX", "NTOTPIX"])
        
        else:
            tbl = Table(rows=data[dtype],
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "FILTER", "CLIPMED", "CLIPSTD"])

        # 2) Convert the DATE-OBS column into Astropy Time objects (and back to ISO strings)
        tbl['DATE-OBS'] = Column(Time(tbl['DATE-OBS'], format='isot').isot,
                                description="ISO‑8601 observation time")

        # 3) Sort in place by DATE-OBS
        tbl.sort('DATE-OBS')

        # 5) Write out as enhanced CSV (ECSV)
        tbl.write(f'/tmp/pipeline/{dtype}.ecsv', format='ascii.ecsv', overwrite=True)
