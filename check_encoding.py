#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检测并修复文件编码问题"""

import os
import sys
from pathlib import Path

def detect_encoding(filepath):
    """检测文件编码"""
    with open(filepath, 'rb') as f:
        first_bytes = f.read(16)
    
    # 检查 BOM
    if len(first_bytes) >= 3 and first_bytes[:3] == b'\xef\xbb\xbf':
        return 'UTF-8 BOM'
    elif len(first_bytes) >= 2 and first_bytes[:2] == b'\xff\xfe':
        return 'UTF-16 LE'
    elif len(first_bytes) >= 2 and first_bytes[:2] == b'\xfe\xff':
        return 'UTF-16 BE'
    elif b'\x00' in first_bytes and first_bytes.count(b'\x00') > 3:
        return 'Possible UTF-16 (many null bytes)'
    
    # 尝试 UTF-8 解码
    try:
        with open(filepath, 'r', encoding='utf-8', errors='strict') as f:
            f.read()
        return 'UTF-8 (no BOM)'
    except UnicodeDecodeError as e:
        return f'Invalid UTF-8 at position {e.start}: {e.reason}'

def scan_files(directories):
    """扫描目录中的所有 .ts/.tsx 文件"""
    invalid_files = []
    all_files = []
    
    for directory in directories:
        if not os.path.exists(directory):
            print(f"Warning: {directory} does not exist")
            continue
            
        for root, dirs, files in os.walk(directory):
            # 跳过 node_modules 和 .next
            if 'node_modules' in root or '.next' in root:
                continue
                
            for file in files:
                if file.endswith(('.ts', '.tsx')):
                    filepath = os.path.join(root, file)
                    all_files.append(filepath)
    
    print(f"\n扫描到 {len(all_files)} 个 TypeScript 文件\n")
    
    for filepath in all_files:
        encoding_info = detect_encoding(filepath)
        if not encoding_info.startswith('UTF-8'):
            invalid_files.append((filepath, encoding_info))
            print(f"❌ {filepath}")
            print(f"   编码: {encoding_info}\n")
    
    if not invalid_files:
        print("✅ 所有文件都可以用 UTF-8 正确解码\n")
    else:
        print(f"\n找到 {len(invalid_files)} 个编码有问题的文件:\n")
        for filepath, info in invalid_files:
            print(f"  {filepath}: {info}")
    
    return invalid_files

def fix_file_encoding(filepath):
    """修复文件编码为 UTF-8 (无 BOM)"""
    try:
        # 尝试多种编码读取
        encodings = ['utf-8', 'utf-16-le', 'utf-16-be', 'gbk', 'gb2312', 'latin-1']
        content = None
        used_encoding = None
        
        for encoding in encodings:
            try:
                with open(filepath, 'r', encoding=encoding) as f:
                    content = f.read()
                    used_encoding = encoding
                    break
            except (UnicodeDecodeError, UnicodeError):
                continue
        
        if content is None:
            return False, "无法用任何编码读取"
        
        # 移除 UTF-8 BOM（如果存在）
        if content.startswith('\ufeff'):
            content = content[1:]
        
        # 以 UTF-8 (无 BOM) 保存
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        
        return True, used_encoding
    except Exception as e:
        return False, str(e)

if __name__ == '__main__':
    directories = ['apps/internal-web', 'packages/shared']
    
    print("=" * 60)
    print("编码检测和修复工具")
    print("=" * 60)
    
    # 1. 检测编码
    invalid_files = scan_files(directories)
    
    # 2. 修复文件
    if invalid_files:
        print("\n开始修复文件编码...\n")
        fixed_files = []
        failed_files = []
        
        for filepath, info in invalid_files:
            print(f"修复: {filepath}")
            success, result = fix_file_encoding(filepath)
            if success:
                print(f"  ✅ 成功 (原编码: {result})")
                fixed_files.append((filepath, result))
            else:
                print(f"  ❌ 失败: {result}")
                failed_files.append((filepath, result))
            print()
        
        # 输出结果
        print("=" * 60)
        print("修复结果:")
        print("=" * 60)
        if fixed_files:
            print(f"\n✅ 成功修复 {len(fixed_files)} 个文件:")
            for filepath, encoding in fixed_files:
                print(f"  {filepath} (原编码: {encoding})")
        
        if failed_files:
            print(f"\n❌ 修复失败 {len(failed_files)} 个文件:")
            for filepath, error in failed_files:
                print(f"  {filepath}: {error}")
    else:
        print("\n无需修复，所有文件编码正常。")
