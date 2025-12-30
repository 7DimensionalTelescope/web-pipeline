import glob
from operator import is_
from pathlib import Path
import yaml
import os
import re
import json
from .const import *
from pathlib import Path


def scan_rawdata_folder(date):
    base = "/lyman/data1/obsdata/"
    exist = False
    for folder in Path(base).iterdir():
        if folder.is_file() or folder.stem.startswith(("_", ".")):
            continue
        for subfolder in folder.iterdir():
            if date in subfolder.stem:
                exist=True
                break
        if exist:
            break
    return exist

def scan_processed_folder(date):
    try:
        base = base_folder(date)
        output = []
        idx = 1
        for folder in Path(base).iterdir():
            if not folder.is_dir() or folder.stem.startswith(("_", ".")):
                continue
            for f in folder.iterdir():
                if f.stem.startswith(("_", ".")):
                    continue
                # process each item sequentially instead of using thread pool
                
                result = _process_one(date, idx, folder.stem, f.stem)
                output.append(result)
                idx += 1
        
        if len(output) == 0:
            existance = scan_rawdata_folder(date)
            if existance:
                print("There is raw data but no processed data found")
            else:
                print("No raw data found")
            return []
        return output
    except Exception as e:
        print(e)
        return []

def _process_one(date, idx, obj, filt):
    row = {
        "id": idx,
        "date": date,
        "obj": obj,
        "filt": filt,
        "masterframe": False,
    }

    # locate the files
    cfg, logf, _, comments = link_to_files(date, obj=obj, filt=filt)

    # read config
    with open(cfg) as f:
        cfgd = yaml.load(f, Loader=yaml.FullLoader)
    pro = sum(cfgd["flag"].values())
    tot = float(len(PROCEDURE))
    pct = pro / tot * 100

    if pro == tot:
        status = "completed"
    elif pro == 0:
        status = "initialized"
    else:
        status = PROCEDURE[pro - 1]

    row.update({
        "status": status,
        "progress": round(pct),
        "warnings": 0,
        "errors": 0,
        "comments": 0,
    })

    if logf:
        w, e = count_warnings_errors(logf)
        row["warnings"], row["errors"] = w, e

    if comments:
        row["comments"] = count_comments(comments)

    return row

def scan_masterframe_folder(date):
    output = []
    try:
        base = base_folder(date, masterframe=True)
        for folder in Path(base).iterdir():
            if (folder.name).startswith("_") or (folder.name).startswith("."):
                continue
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
    except Exception as e:
        print(e)
        return []

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



def link_to_files(date, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, obj=obj, filt=filt)

    if masterframe:
        config = os.path.join(obs_path,f"{date}_{unit}.yml")
        log = os.path.join(obs_path,f"{date}_{unit}.log")
        debug = os.path.join(obs_path, f"{date}_{unit}_debug.log")
        comments = os.path.join("/tmp/pipeline/comments/", f"{date}_{unit}_comments.txt")
        
        if not(os.path.exists(log)):
            log = None
        
        return config, log, debug, comments
    else:
        configs = glob.glob(f"{obs_path}/{obj}_{filt}*.yml")
        if not configs:
            return None, None, None, None
        config = configs[0]
        basename = os.path.basename(config)
        basename = basename.replace(".yml", "")
        log = f"{obs_path}/{basename}.log"
        debug = f"{obs_path}/{basename}_debug.log"
        comments = f"/tmp/pipeline/comments/"+f"/{basename}_comments.txt"

        return config, log, debug, comments

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

def link_to_images(date, obj=None, unit=None, filt=None, masterframe=False):
    obs_path = base_folder(date, obj=obj, unit=unit, filt=filt, masterframe=masterframe)
    images_path = os.path.join(obs_path, "figures")
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

def count_comments(comments_file: str) -> int:    
    if not os.path.exists(comments_file):
        return 0

    with open(comments_file, 'r', encoding='utf-8') as f:
        return sum(1 for line in f if '|' in line)


def get_latest_mtime(path):
    latest_mtime = 0
    for root, dirs, files in os.walk(path):
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                mtime = os.path.getmtime(fpath)
                if mtime > latest_mtime:
                    latest_mtime = mtime
            except Exception:
                continue
    return latest_mtime

def get_filechange_cached_data(cache_file, build_func, folder, *args):
    current_mtime = get_latest_mtime(folder)
    current_mtime_2 = get_latest_mtime("/tmp/pipeline/comments/")

    if os.path.exists(cache_file):
        with open(cache_file, 'r') as f:
            try:
                cache = json.load(f)
            except Exception:
                cache = None
        if cache and cache.get('mtime') == current_mtime and cache.get('mtime') == current_mtime_2:
            return cache['data']
    # If not cached or folder changed, rebuild
    data = build_func(*args)
    with open(cache_file, 'w') as f:
        json.dump({'mtime': current_mtime, 'data': data}, f)
    return data


def get_plot_data(file):
    import pandas as pd
    import numpy as np

    is_flat = "flat" in file
    
    if is_flat:
        plot_keys = ['CLIPSTD', 'CLIPMAX', 'CLIPMIN', 'FILTER']
    else:
        plot_keys = ['CLIPMED', 'CLIPSTD']
    
    if not os.path.exists(file):
        return None, 'File not found'

    try:
        df = pd.read_csv(
            file,
            comment='#',
            sep=' ',
            usecols=['DATE-OBS', 'TELESCOP'] + plot_keys
        )
        df['DATE-OBS'] = pd.to_datetime(df['DATE-OBS'])
        unit_list = sorted(set(df['TELESCOP']))
        plot_data = {}
        for unit in unit_list:
            if is_flat:
                subdf = df[df['TELESCOP'] == unit].sort_values(['DATE-OBS', 'FILTER'])
            else:
                subdf = df[df['TELESCOP'] == unit].sort_values(['DATE-OBS'])
            plot_data[unit] = {
                'dates': subdf['DATE-OBS'].dt.strftime('%Y-%m-%dT00:00:00Z').tolist(),
                'std': subdf['CLIPSTD'].tolist(),
            }
            if is_flat:
                plot_data[unit]['value'] = (subdf['CLIPMAX']-subdf['CLIPMIN']).tolist()
                plot_data[unit]['filter'] = subdf['FILTER'].tolist()
            else:
                plot_data[unit]['value'] = subdf['CLIPMED'].tolist()
        return {'units': unit_list, 'plot_data': plot_data}, None
    except Exception as e:
        return None, str(e)

def update_masterframe_data(dtype = ["bias", "dark", "flat", "bpmask"]):
    from astropy.io import fits
    from astropy.table import Table, Column
    from astropy.time import Time

    base = "/lyman/data2/master_frame"

    data = {}
    for dt in dtype:
        if dt == "bpmask":
            bpmask = [] 
        else:
            data[dt] = []
    
    # Use more efficient glob patterns to find files
    for dt in dtype:
        if dt == "flat":
            base = "/lyman/data2/_master_frame"
        
        if dt == "bpmask":
            # Find all bpmask files in one go
            pattern = str(Path(base) / "*" / "*" / f"{dt}_100s_*.fits")
            files = glob.glob(pattern)
            for file_path in files:
                folder_name = Path(file_path).parent.parent.name
                subfolder_name = Path(file_path).parent.name
                if folder_name.startswith("_") or subfolder_name.startswith("_"):
                    continue
                header = fits.getheader(file_path, ext=1)
                bpmask.append([folder_name, subfolder_name, dt, header["NHOTPIX"], header["NAXIS1"]*header["NAXIS2"]])
            
        else:
            # Find all files for this data type in one go
            if dt == "dark":
                pattern = str(Path(base) / "*" / "*" / f"{dt}_100s_*.fits")
            else:
                pattern = str(Path(base) / "*" / "*" / f"{dt}_*.fits")
            
            files = glob.glob(pattern)
            for file_path in files:
                folder_name = Path(file_path).parent.parent.name
                subfolder_name = Path(file_path).parent.name
                if folder_name.startswith("_") or subfolder_name.startswith("_"):
                    continue
                header = fits.getheader(file_path)
                if dt == "dark":
                    data[dt].append([folder_name, subfolder_name, header["IMAGETYP"], header["FILTER"], header["CLIPMEAN"], header["CLIPMED"], header["CLIPSTD"], header["CLIPMIN"], header["CLIPMAX"], header["DATE-LOC"], header["NDELTA"], header["NHOTPIX"], header["CCD-TEMP"], header["AMBTEMP"], header["SKYTEMP"], header["UNIFORM"]])
                elif dt == "flat":
                    try:
                        data[dt].append([folder_name, subfolder_name, header["IMAGETYP"], header["FILTER"], header["CLIPMEAN"], header["CLIPMED"], header["CLIPSTD"], header["CLIPMIN"], header["CLIPMAX"], header["SIGMEAN"], header["SIGMED"], header["SIGSTD"], header["REFRMS"], header["CUTTED"], header["EDGEVAR"]])
                    except:
                        print()
                else:
                    data[dt].append([folder_name, subfolder_name, header["IMAGETYP"], header["FILTER"], header["CLIPMEAN"], header["CLIPMED"], header["CLIPSTD"], header["CLIPMIN"], header["CLIPMAX"]])
                
    for dt in dtype:     
        if dt == "bpmask":
            tbl = Table(rows=bpmask,
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "NHOTPIX", "NTOTPIX"])
        
        elif dt == "dark":
            tbl = Table(rows=data[dt],
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "FILTER", "CLIPMEAN", "CLIPMED", "CLIPSTD", "CLIPMIN", "CLIPMAX", "DATE-LOC", "NDELTA", "NHOTPIX", "CCD-TEMP", "AMBTEMP", "SKYTEMP", "UNIFORM"])
        elif dt == "flat":
            tbl = Table(rows=data[dt],
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "FILTER", "CLIPMEAN", "CLIPMED", "CLIPSTD", "CLIPMIN", "CLIPMAX", "SIGMEAN", "SIGMED", "SIGSTD", "REFRMS", "CUTTED", "EDGEVAR"])
        else:
            tbl = Table(rows=data[dt],
                    names=["DATE-OBS", "TELESCOP", "IMAGETYP", "FILTER", "CLIPMEAN", "CLIPMED", "CLIPSTD", "CLIPMIN", "CLIPMAX"])

        # 2) Convert the DATE-OBS column into Astropy Time objects (and back to ISO strings)
        tbl['DATE-OBS'] = Column(Time(tbl['DATE-OBS'], format='isot').isot,
                                description="ISO‑8601 observation time")

        # 3) Sort in place by DATE-OBS
        tbl.sort('DATE-OBS')

        # 5) Write out as enhanced CSV (ECSV)
        tbl.write(f'/tmp/pipeline/{dt}.ecsv', format='ascii.ecsv', overwrite=True)
