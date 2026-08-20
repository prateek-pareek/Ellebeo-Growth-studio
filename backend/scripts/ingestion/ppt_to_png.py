import os
import sys
import time
import win32com.client
import imagehash
from PIL import Image
import json

def convert_ppts_to_pngs(raw_folder, staging_folder):
    if not os.path.exists(staging_folder):
        os.makedirs(staging_folder)
        
    print(f"Connecting to Microsoft PowerPoint via win32com...")
    try:
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
    except Exception as e:
        print(f"Error starting PowerPoint: {e}")
        return []

    pptx_files = [f for f in os.listdir(raw_folder) if f.endswith(('.ppt', '.pptx'))]
    print(f"Found {len(pptx_files)} PPT files in {raw_folder}.")
    
    total_slides = 0
    exported_images = []

    for file in pptx_files:
        pptx_path = os.path.abspath(os.path.join(raw_folder, file))
        file_base_name = os.path.splitext(file)[0].replace(" ", "_")
        
        # We will dump all slides into the staging folder directly with a unique prefix
        print(f"Processing: {file}...")
        try:
            presentation = powerpoint.Presentations.Open(pptx_path, WithWindow=False)
            
            for i, slide in enumerate(presentation.Slides):
                slide_num = i + 1
                output_path = os.path.abspath(os.path.join(staging_folder, f"{file_base_name}_slide_{slide_num}.png"))
                slide.Export(output_path, "PNG")
                exported_images.append(output_path)
                total_slides += 1
                
            presentation.Close()
            print(f"  -> Exported {presentation.Slides.Count} slides successfully.")
        except Exception as e:
            print(f"  -> Error exporting {file}: {e}")
            
    print("Closing PowerPoint...")
    powerpoint.Quit()
    print(f"Done! Exported {total_slides} slides across {len(pptx_files)} presentations.")
    return exported_images

def cluster_layouts(image_paths, output_json):
    print("\nStarting Phase 1b: Perceptual Hashing (pHash) Clustering...")
    clusters = {}
    
    for idx, path in enumerate(image_paths):
        if not os.path.exists(path):
            continue
            
        try:
            img = Image.open(path)
            # pHash focuses on geometric structure, making it perfect for layout clustering
            phash = str(imagehash.phash(img))
            
            if phash not in clusters:
                clusters[phash] = []
            clusters[phash].append(path)
            
        except Exception as e:
            print(f"Error hashing {path}: {e}")
            
    print(f"\nClustering Complete!")
    print(f"Total Slides Processed: {len(image_paths)}")
    print(f"Total UNIQUE Layouts Found: {len(clusters.keys())}")
    
    # Save the manifest
    manifest = []
    for phash, paths in clusters.items():
        manifest.append({
            "hash": phash,
            "base_image": paths[0],
            "duplicate_count": len(paths) - 1,
            "duplicates": paths[1:]
        })
        
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Manifest saved to {output_json}")

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    raw_dir = os.path.join(current_dir, "raw_ppts")
    staging_dir = os.path.join(current_dir, "staging")
    output_json = os.path.join(current_dir, "unique_layouts.json")
    
    images = convert_ppts_to_pngs(raw_dir, staging_dir)
    
    if images:
        cluster_layouts(images, output_json)
