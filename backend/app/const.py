import os

DATA_DIR = "/data/pipeline_reform/processed_test_light/"
MASTERFRAME_DIR = "/data/pipeline_reform/master_frame_test/"
SCRIPT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROCEDURE = ['configuration', 'preprocess', 'astrometry', 'single_photometry', 'combine', 'combined_photometry', 'subtraction']

