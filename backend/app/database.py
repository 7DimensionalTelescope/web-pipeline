"""
Database connection module for the web pipeline backend.
Provides access to the pipeline database using the existing database services.
"""

import os
import sys
from typing import List, Dict, Optional, Union, Any
from datetime import date, datetime
import json

# Add the pipeline path to sys.path to import the database services
pipeline_path = "/home/7dt/pipeline"
if pipeline_path not in sys.path:
    sys.path.insert(0, pipeline_path)

from gppy.services.database import (
    DatabaseHandler,
    RawImageQuery,
)

class DatabaseConnection:
    """Database connection wrapper for the web pipeline backend"""
    
    def __init__(self):
        """Initialize database connection"""
        self.db_handler = None
        self.pipeline_db = None
        self.qa_db = None
        self.is_connected = False
        
        if DatabaseHandler is not None:
            try:
                self.db_handler = DatabaseHandler()
                self.pipeline_db = self.db_handler.pipeline_db
                self.qa_db = self.db_handler.qa_db
                self.is_connected = True
                print("Database connection established successfully")
            except Exception as e:
                print(f"Failed to establish database connection: {e}")
                self.is_connected = False
        else:
            print("Database services not available")
    
    def get_pipeline_data(self, date: str, masterframe: bool = False, 
                         unit: Optional[str] = None, obj: Optional[str] = None, 
                         filt: Optional[str] = None, mf_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get pipeline data from database instead of scanning folders
        
        Args:
            date: Date string in YYYY-MM-DD format
            masterframe: Whether to get masterframe data
            unit: Unit name for masterframe queries
            obj: Object name for science queries
            filt: Filter name for science queries
            mf_type: Masterframe type filter ('dark' or 'flat') - filters by QA records
            
        Returns:
            List of pipeline data dictionaries
        """
        if not self.is_connected or not self.pipeline_db:
            return []
        
        try:
            if masterframe:
                # Query masterframe data
                filters = {
                    'run_date': date,
                    'data_type': 'masterframe'
                }
                if unit:
                    filters['unit'] = unit
                
                pipeline_records = self.pipeline_db.read_pipeline_data(**filters)
                
                record_list = pipeline_records if isinstance(pipeline_records, list) else [pipeline_records]
                
                # Fix dark/flat parsing - psycopg returns jsonb as lists, but from_row doesn't handle it correctly
                # So we need to get the raw values from the database
                records_dict = []
                for record in record_list:
                    record_dict = record.to_dict()
                    
                    # Fix dark/flat arrays by querying raw database values
                    # The ORM's from_row method doesn't correctly parse jsonb that's already a list
                    try:
                        pipeline_id = getattr(record, 'id', None)
                        if pipeline_id:
                            # Query raw database to get actual dark/flat values
                            with self.pipeline_db.get_connection() as conn:
                                with conn.cursor() as cur:
                                    cur.execute(
                                        "SELECT dark, flat FROM pipeline_process WHERE id = %s",
                                        (pipeline_id,)
                                    )
                                    result = cur.fetchone()
                                    if result:
                                        dark_raw, flat_raw = result
                                        # Handle both list (from jsonb) and string (json) formats
                                        if isinstance(dark_raw, list):
                                            record_dict['dark'] = dark_raw
                                        elif isinstance(dark_raw, str) and dark_raw:
                                            record_dict['dark'] = json.loads(dark_raw)
                                        else:
                                            record_dict['dark'] = []
                                        
                                        if isinstance(flat_raw, list):
                                            record_dict['flat'] = flat_raw
                                        elif isinstance(flat_raw, str) and flat_raw:
                                            record_dict['flat'] = json.loads(flat_raw)
                                        else:
                                            record_dict['flat'] = []
                    except Exception as e:
                        # If query fails, use whatever is in the record (may be empty)
                        print(f"Warning: Could not fix dark/flat for pipeline_id={pipeline_id}: {e}")
                    
                    records_dict.append(record_dict)
                
                # If filtering by type (dark/flat), filter by array contents
                if mf_type and mf_type.lower() in ['dark', 'flat']:
                    type_key = mf_type.lower()
                    filtered_records = [
                        record for record in records_dict
                        if isinstance(record.get(type_key), list) and len(record.get(type_key, [])) > 0
                    ]
                    return filtered_records
                
                return records_dict
            else:
                # Query science data
                filters = {
                    'run_date': date,
                    'data_type': 'science'
                }
                if obj:
                    filters['obj'] = obj
                if filt:
                    filters['filt'] = filt
                
                pipeline_records = self.pipeline_db.read_pipeline_data(**filters)
                
                if isinstance(pipeline_records, list):
                    return [record.to_dict() for record in pipeline_records]
                elif pipeline_records:
                    return [pipeline_records.to_dict()]
                else:
                    return []
                    
        except Exception as e:
            print(f"Error querying pipeline data: {e}")
            return []
    
    
    def get_raw_data_status(self, date: str) -> bool:
        """
        Check if raw data exists for a given date using database query
        
        Args:
            date: Date string in YYYY-MM-DD format
            
        Returns:
            True if raw data exists, False otherwise
        """
        if not self.is_connected or not RawImageQuery:
            return False
        
        try:
            # Query for any raw images on the given date
            query = RawImageQuery().on_date(date).of_types(['sci', 'bias', 'dark', 'flat'])
            results = query.fetch()
            
            # Check if any results exist
            for img_type, files in results.items():
                if files:
                    return True
            return False
            
        except Exception as e:
            print(f"Error checking raw data status: {e}")
            return False
    
    def get_qa_plot_data(self, qa_type: str) -> List[Dict[str, Any]]:
        """
        Get QA data for plotting purposes
        
        Args:
            qa_type: Type of QA data ('bias', 'dark', 'flat', 'science')
            
        Returns:
            List of QA data dictionaries formatted for plotting
        """
        if not self.is_connected or not self.qa_db:
            return []
        
        try:
            # Validate qa_type
            valid_types = {'bias', 'dark', 'flat', 'science'}
            if qa_type not in valid_types:
                return []
            
            # Get QA data
            qa_records = self.qa_db.get_enhanced_qa_records(qa_type=qa_type)
            
            return qa_records
                
        except Exception as e:
            print(f"Error getting QA plot data: {e}")
            return []
    
    def get_qa_plot_data_by_date_range(self, qa_type: str, start_date: str = None, end_date: str = None) -> List[Dict[str, Any]]:
        """
        Get QA data for plotting within a date range
        
        Args:
            qa_type: Type of QA data ('bias', 'dark', 'flat', 'bpmask')
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format
            
        Returns:
            List of QA data dictionaries formatted for plotting
        """
        if not self.is_connected or not self.qa_db:
            return []
        
        try:
            # For now, get all data and filter by date in Python
            # In the future, this could be optimized with SQL date filtering
            all_data = self.get_qa_plot_data(qa_type, limit=5000)
            
            if not all_data:
                return []
            
            # Filter by date range if specified
            filtered_data = []
            for record in all_data:
                if record.get('created_at'):
                    record_date = record['created_at'][:10]  # Extract YYYY-MM-DD
                    
                    if start_date and record_date < start_date:
                        continue
                    if end_date and record_date > end_date:
                        continue
                    
                    filtered_data.append(record)
            
            return filtered_data
                
        except Exception as e:
            print(f"Error getting QA plot data by date range: {e}")
            return []
    

# Global database connection instance
db_connection = DatabaseConnection()
