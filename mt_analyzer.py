"""
MT_Analyze tool is used to batch analyze apk based on mariana-trench \
                                                 tool. So make sure you have installed mariana-trench firstly
USAGE:
     1 analyze one apk by the param "-a" or "--apk",or
     2 analyze all the apks in a directory by the param "-d" or "--dir",or
     3 analyze all the apk in the phone,which will be pulled out to the local directory by adb. In this case, please use
       param "-s" or "--usb".make sure you have installed adb tools and have connected to the target phone. Also, the
       full path of adb tool must set in the @PATH environment variable.
     Because the tool is based on mariana-trench(https://github.com/facebook/mariana-trench),so you must install
     mariana-trench before, such as "pip install mariana-trench"
"""
import os
import time
import sys
import argparse
import subprocess

global current_path


def find_all_apks(apks_dir):
    for root, ds, files in os.walk(apks_dir):
        for file in files:
            if file.endswith('.apk'):
                apk_path = os.path.join(root, file)
                yield apk_path


def analyze_one_apk_by_mariana_trench(apk_path):
    dir_name, full_file_name = os.path.split(apk_path)
    file_name, file_ext = os.path.splitext(full_file_name)
    if file_ext == ".apk":
        out_directory = dir_name + file_name
        if not os.path.exists(out_directory):
            os.makedirs(out_directory)
        cmd = "mariana-trench --apk_path=" + apk_path + " --output-directory=" + out_directory
        result = subprocess.Popen(cmd, Shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).communicate()
        print(result)
        cmd = "sapp --tool=mariana-trench analyze " + out_directory
        result = result = subprocess.Popen(cmd, Shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).communicate()
        print(result)


def analyze_by_mariana_trench(apks_dir):
    apks = find_all_apks(apks_dir)
    for apk in apks:
        analyze_one_apk_by_mariana_trench(apk)


def pull_aks_from_phone_by_adb(apks_dir):
    outs_data = subprocess.Popen('adb shell pm list package -f', shell=True, stdout=subprocess.PIPE, text=True)
    packages = outs_data.stdout.readlines()
    package_list = []
    for package in packages:
        package = package.strip()
        if package:
            package_list.append(package)
    if package_list is not None:
        for package in package_list:
            temp = package.split(':')[1]
            path = temp.rsplit('=', 1)[0]
            package_name = temp.rsplit('=', 1)[1]
            cmd = "adb pull " + path + " " + apks_dir + "//" + package_name + ".apk"
            result = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).communicate()
            print(result)


def analyze_enter():
    global current_path
    parser = argparse.ArgumentParser(description="MT_Analyze tool is used to batch analyze apk based on mariana-trench \
                                                 tool. So make sure you has install mariana-trench firstly")
    parser.add_argument("-d", "--dir", required=False, type=str, help="dir where the apks to analyzed")
    parser.add_argument("-a", "--apk", required=False, type=str, help="the full path of apk to analyzed")
    parser.add_argument("-u", "--usb", required=False, type=bool, help="adb is used to collect all the apk \
                                                                    pulled from phone")
    args = parser.parse_args()
    input_dir = args.dir
    apk_path = args.apk
    is_used_adb_to_pull_apks = args.usb
    current_path = os.path.abspath(sys.argv[0])
    work_path = current_path.rpartition("/")[0]

    if input_dir is None and apk_path is None and is_used_adb_to_pull_apks == True:
        print("input dir and apk is not set ,try to use adb pull apk from phone")
        apks_dir = work_path + "//" + "APKs"
        if not os.path.exists(apks_dir):
            os.makedirs(apks_dir)
        pull_aks_from_phone_by_adb(apks_dir)
        analyze_by_mariana_trench(apks_dir)

    if apk_path is not None:
        analyze_one_apk_by_mariana_trench(apk_path)

    if input_dir is not None:
        analyze_by_mariana_trench(input_dir)


if __name__ == '__main__':
    start_time = time.time()
    analyze_enter()
    end_time = time.time()
    print("All time used for analyze is:")
    print(str(end_time - start_time) + " s")
