import glob
from pathlib import Path
from astropy.table import Table
from numpy import int64
import yaml
import os
import re

from .const import *

def scan_processed_folder(date):
    # Find the base folder and metadata
    base = base_folder(date)

    metadata = base / "metadata.ecsv"
    # Read metadata table
    table = Table.read(metadata, format="ascii.ecsv")

    # Build the output dictionary
    output = []
    for i, row in enumerate(table):
        # Get observation path
        config_file = link_to_config(date,row["gain"], row["n_binning"],  row["object"], row["unit"], row["filter"], )

        with open(config_file, "r") as f:
            config = yaml.load(f, Loader=yaml.FullLoader)
        
        # Calculate progress
        pro = sum(config["flag"].values())
        tot = len(PROCEDURE)
        progress = pro/tot
        status = "completed" if pro == tot else PROCEDURE[pro-1]

        # Create row dictionary
        row_dict = {"id": i+1}
        for key in row.keys():
            if type(row[key]) == int64:
                row_dict[key] = int(row[key])
            else:
                row_dict[key] = row[key]
        row_dict["progress"] = round(progress*100)
        row_dict["status"] = status
        row_dict["date"] = date
        row_dict["masterframe"] = False

        log_file, _ = link_to_log(date, row["gain"], row["n_binning"], row["object"], row["unit"], row["filter"], )
        if log_file:
            row_dict["warnings"], row_dict["errors"] = count_warnings_errors(log_file)
        else:
            row_dict["warnings"] = 0
            row_dict["errors"] = 0

        comments_file = link_to_comments(date, row["gain"], row["n_binning"], row["object"], row["unit"], row["filter"], )
        if comments_file:
            row_dict["comments"] = count_comments(comments_file)
        else:
            row_dict["comments"] = 0

        output.append(row_dict)

    return output


def scan_masterframe_folder(date):
    base = base_folder(date, masterframe=True)
    base_name = os.path.basename(base).split("_")
    n_binning = base_name[1][0]
    gain = base_name[2].replace("gain", "")
    
    output = []
    
    for f in Path(base).iterdir():
        row_dict = {
            "date": date,
            "unit": f.name,
            "n_binning": n_binning,
            "gain": gain,
            "bias": False,
            "dark": False,
            "flat": set(),
            "masterframe": True
        }
        
        for file in f.iterdir():
            file_name = file.name
            if "bias_" in file_name:
                row_dict["bias"] = True
            elif "dark_" in file_name:
                row_dict["dark"] = True
            elif "flat_" in file_name:
                row_dict["flat"].add(file_name.split("_")[2])
        
        row_dict["flat"] = list(row_dict["flat"]) if row_dict["flat"] else False

        log_file, _ = link_to_log(date, row_dict["gain"], row_dict["n_binning"], None, row_dict["unit"], None, True)

        if log_file:
            row_dict["warnings"], row_dict["errors"] = count_warnings_errors(log_file)
        else:
            row_dict["warnings"] = 0
            row_dict["errors"] = 0
        
        comments_file = link_to_comments(date, row_dict["gain"], row_dict["n_binning"], None, row_dict["unit"], None, True)
        if comments_file:
            row_dict["comments"] = count_comments(comments_file)
        else:
            row_dict["comments"] = 0

        
        output.append(row_dict)
    
    return output

def param_set(request):
    date = request.args.get("date")
    gain = request.args.get("gain")
    n_binning = request.args.get("n_binning")
    unit = request.args.get("unit")
    masterframe = request.args.get("masterframe")
    if type(masterframe) == str:
        masterframe = masterframe.lower() == 'true'
    elif type(masterframe) != bool:
        masterframe = False
        print("masterframe is not a boolean, setting to False")
        
    if masterframe:
        return date, gain, n_binning, None, unit, None, masterframe
    else:
        obj = request.args.get("obj")
        filt = request.args.get("filt")
        return date, gain, n_binning, obj, unit, filt, masterframe

def base_folder(date, gain=None, n_binning=None, obj=None, unit=None, filt=None, masterframe=False):
    if masterframe:
        data_folder = Path(MASTERFRAME_DIR)
    else:
        data_folder = Path(DATA_DIR)

    for f in data_folder.iterdir():
        if date in str(f.as_posix()):
            if gain is not None and n_binning is not None:
                if f"gain{int(gain)}" in str(f.as_posix()) and f"{int(n_binning)}x{int(n_binning)}" in str(f.as_posix()):
                    base_folder = f.absolute()
                    break
            else:
                base_folder = f.absolute()
                break

    if masterframe:
        if unit:
            base_folder = os.path.join(base_folder, unit)
    else:
        if obj and unit and filt:
            base_folder = os.path.join(base_folder, obj, unit, filt)
        
    return base_folder

def link_to_config(date, gain, n_binning, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, gain, n_binning, obj, unit, filt, masterframe)
    return glob.glob(obs_path + "/*.yml")[0]

def link_to_log(date, gain, n_binning, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, gain, n_binning, obj, unit, filt, masterframe)
    logs = glob.glob(obs_path + "/*.log")
    debug = None
    for log in logs:
        if "debug" in log:
            debug = log
            logs.remove(log)
            break
    regular_log = logs[0] if logs else None
    return regular_log, debug

def link_to_comments(date, gain, n_binning, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, gain, n_binning, obj, unit, filt, masterframe)
    comments_path = os.path.join(obs_path, "comments")
    os.makedirs(comments_path, exist_ok=True)
    if masterframe:
        comments_file = comments_path + f"/{date}_{n_binning}x{n_binning}_gain{gain}_{unit}.txt"
    else:
        comments_file = comments_path + f"/{date}_{n_binning}x{n_binning}_gain{gain}_{obj}_{unit}_{filt}.txt"
    return comments_file

def link_to_images(date, gain, n_binning, obj=None, unit=None, filt=None, masterframe=False):
    if masterframe:
        return []
    obs_path = base_folder(date, gain, n_binning, obj, unit, filt, masterframe)
    images_path = os.path.join(obs_path, "phot_image")
    os.makedirs(images_path, exist_ok=True)
    images = glob.glob(images_path + "/*.png")
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