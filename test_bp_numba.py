import pandas as pd
import os
from pathlib import Path
import numpy as np
from astropy.io import fits
import time

# Try to import numba for JIT compilation
try:
    from numba import jit, prange
    NUMBA_AVAILABLE = True
    print("Numba is available - using JIT compilation for speed")
    
    @jit(nopython=True, parallel=True)
    def fast_evolution_update(evolution_tracker, mask_data):
        """
        Numba-optimized function to update evolution tracker.
        Formula: X = X*Y + Y where Y=1 for bad pixels, Y=0 for good pixels
        """
        new_tracker = np.zeros_like(evolution_tracker)
        
        # Vectorized operation for bad pixels
        for y in prange(evolution_tracker.shape[0]):
            for x in range(evolution_tracker.shape[1]):
                if mask_data[y, x] > 0:  # Bad pixel in new mask
                    # X = X*1 + 1 = X + 1 (increment bad pixel counter)
                    new_tracker[y, x] = evolution_tracker[y, x] + 1
                else:  # Good pixel in new mask
                    # X = X*0 + 0 = 0 (reset to good pixel)
                    new_tracker[y, x] = 0
        
        return new_tracker
        
except ImportError:
    NUMBA_AVAILABLE = False
    print("Numba not available - using standard numpy operations")
    
    def fast_evolution_update(evolution_tracker, mask_data):
        """
        Fallback function using vectorized numpy operations.
        Formula: X = X*Y + Y where Y=1 for bad pixels, Y=0 for good pixels
        """
        new_tracker = np.zeros_like(evolution_tracker)
        bad_pixel_mask = mask_data > 0
        if np.any(bad_pixel_mask):
            # For bad pixels: X = X*1 + 1 = X + 1
            new_tracker[bad_pixel_mask] = evolution_tracker[bad_pixel_mask] + 1
        # For good pixels: X = X*0 + 0 = 0 (already set to 0)
        return new_tracker

# Read the data
data = pd.read_csv('/tmp/pipeline/dark.ecsv', sep=' ', comment='#')
data['DATE-OBS'] = pd.to_datetime(data['DATE-OBS'])

# Apply BOTH cuts: UNIFORM < -2.15 AND DATE-OBS > 2025-05-01
subdata = data[(data['UNIFORM'] < -2.15) & (data['DATE-OBS'] > '2025-05-01')]

print(f'=== Testing Bad Pixel Evolution for Unit 7DT05 ===')
print(f'Records for 7DT05: {len(subdata[subdata["TELESCOP"] == "7DT05"])}')

# Base directory for FITS files
base_dir = Path('/lyman/data2/master_frame')

def get_units_and_dates_from_csv(subdata_df: pd.DataFrame):
    """
    From filtered CSV (subdata), build mapping of unit -> sorted list of dates (YYYY-MM-DD strings).
    """
    units = sorted(subdata_df['TELESCOP'].unique())
    unit_to_dates = {}
    for unit in units:
        dates = sorted({d.strftime('%Y-%m-%d') for d in subdata_df[subdata_df['TELESCOP'] == unit]['DATE-OBS'].dt.date})
        unit_to_dates[unit] = dates
    return unit_to_dates

def find_bpmask_files_for_unit_on_dates(unit: str, date_str_list):
    """
    Find bpmask FITS files for a specific unit limited to provided date strings (YYYY-MM-DD).
    Returns list of (pd.Timestamp date, Path file_path) sorted by date.
    """
    bpmask_files = []
    for date_str in date_str_list:
        date_dir = base_dir / date_str / unit
        if not date_dir.exists():
            continue
        files = list(date_dir.glob('bpmask_*.fits'))
        for file_path in files:
            # Prefer parsing date from filename if present, else use folder date
            filename = file_path.name
            date_val = None
            parts = filename.split('_')
            if len(parts) >= 4 and parts[3].isdigit():
                try:
                    date_val = pd.to_datetime(parts[3], format='%Y%m%d')
                except Exception:
                    date_val = pd.to_datetime(date_str)
            else:
                date_val = pd.to_datetime(date_str)
            bpmask_files.append((date_val, file_path))
    bpmask_files.sort(key=lambda x: x[0])
    return bpmask_files

def analyze_unit_always_bad(unit: str, date_str_list):
    """
    Run fast evolution on the exact date set for a unit and return always-bad stats.
    """
    files = find_bpmask_files_for_unit_on_dates(unit, date_str_list)
    if not files:
        print(f"No bpmask files for {unit} on provided dates ({len(date_str_list)} dates)")
        return None
    # Initialize
    evolution_tracker = None
    first_mask_shape = None
    processed = 0
    for i, (date, file_path) in enumerate(files):
        try:
            with fits.open(file_path) as hdul:
                if len(hdul) < 2:
                    continue
                mask_data = hdul[1].data
                if mask_data is None:
                    continue
                if first_mask_shape is None:
                    first_mask_shape = mask_data.shape
                    evolution_tracker = np.where(mask_data > 0, 1, 0)
                else:
                    if mask_data.shape != first_mask_shape:
                        # Skip mismatched shapes
                        continue
                    evolution_tracker = fast_evolution_update(evolution_tracker, mask_data)
                processed += 1
        except Exception:
            continue
    if evolution_tracker is None or processed == 0:
        return None
    num_files = processed
    always_bad_mask = (evolution_tracker == num_files)
    always_bad_count = int(always_bad_mask.sum())
    always_bad_fraction = always_bad_count / evolution_tracker.size
    return {
        'unit': unit,
        'files_processed': num_files,
        'shape': first_mask_shape,
        'always_bad_count': always_bad_count,
        'always_bad_fraction': always_bad_fraction,
        'final_bad_pixels': int((evolution_tracker > 0).sum()),
        'final_bad_fraction': float((evolution_tracker > 0).sum() / evolution_tracker.size),
    }

# Replace main() to run across all units/dates from CSV cuts
def main():
    print("=== Ultra-Fast Bad Pixel Evolution Across Units (CSV-driven) ===")
    # subdata already defined with cuts
    print(f"Filtered rows: {len(subdata)}  (UNIFORM<-2.15 & DATE-OBS>'2025-05-01')")
    unit_to_dates = get_units_and_dates_from_csv(subdata)
    print(f"Units to analyze: {len(unit_to_dates)} -> {sorted(unit_to_dates.keys())}")

    results = []
    start = time.time()
    for unit, dates in unit_to_dates.items():
        if not dates:
            continue
        print(f"\nProcessing {unit} with {len(dates)} dates ...")
        res = analyze_unit_always_bad(unit, dates)
        if res is None:
            print(f"  No usable bpmask data for {unit}")
            continue
        results.append(res)
        print(f"  Files processed: {res['files_processed']}")
        print(f"  Always-bad: {res['always_bad_count']} ({res['always_bad_fraction']*100:.4f}%)")
        print(f"  Final bad: {res['final_bad_pixels']} ({res['final_bad_fraction']*100:.4f}%)")
    elapsed = time.time() - start

    if not results:
        print("No results produced.")
        return None

    # Print summary table
    print("\n=== Summary (Always-bad per unit) ===")
    print("unit,files,always_bad_count,always_bad_fraction,final_bad_pixels,final_bad_fraction")
    for r in results:
        print(f"{r['unit']},{r['files_processed']},{r['always_bad_count']},{r['always_bad_fraction']:.6f},{r['final_bad_pixels']},{r['final_bad_fraction']:.6f}")

    # Save CSV
    out_path = Path('/tmp/always_bad_summary.csv')
    pd.DataFrame(results).to_csv(out_path, index=False)
    print(f"\nSaved summary to {out_path}")
    print(f"Total time: {elapsed:.2f}s  ({len(results)} units)")
    return results

if __name__ == "__main__":
    results = main()
