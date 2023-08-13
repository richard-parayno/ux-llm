import os
import shutil

def clear_session_files(session_directory):
    """
    Deletes all session files in the given directory.
    """
    for filename in os.listdir(session_directory):
        file_path = os.path.join(session_directory, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print(f"Failed to delete {file_path}. Reason: {e}")
