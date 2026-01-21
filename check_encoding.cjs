#!/usr/bin/env node
/**
 * 检测并修复文件编码问题
 */

const fs = require('fs');
const path = require('path');

function detectEncoding(filepath) {
  const buffer = fs.readFileSync(filepath);
  const firstBytes = buffer.slice(0, 16);
  
  // 检查 BOM
  if (firstBytes[0] === 0xEF && firstBytes[1] === 0xBB && firstBytes[2] === 0xBF) {
    return { encoding: 'UTF-8 BOM', valid: true };
  } else if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    return { encoding: 'UTF-16 LE', valid: false };
  } else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
    return { encoding: 'UTF-16 BE', valid: false };
  }
  
  // 检查是否有大量 null bytes (可能 UTF-16)
  const nullCount = firstBytes.filter(b => b === 0x00).length;
  if (nullCount > 3) {
    return { encoding: 'Possible UTF-16 (many null bytes)', valid: false };
  }
  
  // 尝试 UTF-8 解码
  try {
    const content = buffer.toString('utf8');
    // 检查是否有无效的 Unicode 字符 (replacement character)
    if (content.includes('\uFFFD')) {
      return { encoding: 'UTF-8 with invalid sequences ()', valid: false };
    }
    return { encoding: 'UTF-8 (no BOM)', valid: true };
  } catch (e) {
    return { encoding: `Invalid UTF-8: ${e.message}`, valid: false };
  }
}

function scanFiles(directories) {
  const invalidFiles = [];
  const allFiles = [];
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) {
      console.log(`Warning: ${dir} does not exist`);
      return;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // 跳过 node_modules, .next, .git 等
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git' || entry.name === '.turbo') {
        continue;
      }
      
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        allFiles.push(fullPath);
      }
    }
  }
  
  for (const dir of directories) {
    walkDir(dir);
  }
  
  console.log(`\n扫描到 ${allFiles.length} 个 TypeScript 文件\n`);
  
  for (const filepath of allFiles) {
    const result = detectEncoding(filepath);
    if (!result.valid) {
      invalidFiles.push({ filepath, info: result.encoding });
      console.log(`❌ ${filepath}`);
      console.log(`   编码: ${result.encoding}\n`);
    }
  }
  
  if (invalidFiles.length === 0) {
    console.log('✅ 所有文件都可以用 UTF-8 正确解码\n');
  } else {
    console.log(`\n找到 ${invalidFiles.length} 个编码有问题的文件:\n`);
    for (const { filepath, info } of invalidFiles) {
      console.log(`  ${filepath}: ${info}`);
    }
  }
  
  return invalidFiles;
}

function fixFileEncoding(filepath) {
  try {
    const buffer = fs.readFileSync(filepath);
    
    // 尝试多种编码读取
    let content = null;
    let usedEncoding = null;
    
    // 1. 尝试 UTF-16 LE (Windows 常见)
    try {
      const utf16Content = buffer.toString('utf16le');
      // UTF-16 通常没有 null 字符在正常文本位置
      if (utf16Content.length > 0 && !utf16Content.includes('\u0000')) {
        content = utf16Content;
        usedEncoding = 'UTF-16 LE';
      }
    } catch (e) {
      // 忽略
    }
    
    // 2. 尝试 UTF-8
    if (!content) {
      try {
        const utf8Content = buffer.toString('utf8');
        // 检查是否有 replacement character
        if (!utf8Content.includes('\uFFFD')) {
          content = utf8Content;
          usedEncoding = 'UTF-8';
        }
      } catch (e) {
        // 忽略
      }
    }
    
    // 3. 尝试 Latin-1 (ISO-8859-1) 作为后备
    if (!content) {
      try {
        content = buffer.toString('latin1');
        usedEncoding = 'Latin-1';
      } catch (e) {
        // 忽略
      }
    }
    
    if (!content) {
      return { success: false, error: '无法用任何编码读取' };
    }
    
    // 移除 UTF-8 BOM（如果存在）
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // 移除 UTF-16 BOM 字符（如果存在）
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // 以 UTF-8 (无 BOM) 保存，使用 LF 换行符
    fs.writeFileSync(filepath, content, { encoding: 'utf8' });
    
    return { success: true, originalEncoding: usedEncoding || 'unknown' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 主程序
const directories = ['apps/internal-web', 'packages/shared'];

console.log('='.repeat(60));
console.log('编码检测和修复工具');
console.log('='.repeat(60));

// 1. 检测编码
const invalidFiles = scanFiles(directories);

// 2. 修复文件
if (invalidFiles.length > 0) {
  console.log('\n开始修复文件编码...\n');
  const fixedFiles = [];
  const failedFiles = [];
  
  for (const { filepath, info } of invalidFiles) {
    console.log(`修复: ${filepath}`);
    const result = fixFileEncoding(filepath);
    if (result.success) {
      console.log(`  ✅ 成功 (原编码: ${result.originalEncoding})`);
      fixedFiles.push({ filepath, originalEncoding: result.originalEncoding, detectedInfo: info });
    } else {
      console.log(`  ❌ 失败: ${result.error}`);
      failedFiles.push({ filepath, error: result.error, detectedInfo: info });
    }
    console.log();
  }
  
  // 输出结果
  console.log('='.repeat(60));
  console.log('修复结果:');
  console.log('='.repeat(60));
  
  if (fixedFiles.length > 0) {
    console.log(`\n✅ 成功修复 ${fixedFiles.length} 个文件:`);
    for (const { filepath, originalEncoding, detectedInfo } of fixedFiles) {
      console.log(`  ${filepath}`);
      console.log(`    检测编码: ${detectedInfo}`);
      console.log(`    修复为: UTF-8 (无 BOM), 原编码: ${originalEncoding}`);
    }
  }
  
  if (failedFiles.length > 0) {
    console.log(`\n❌ 修复失败 ${failedFiles.length} 个文件:`);
    for (const { filepath, error, detectedInfo } of failedFiles) {
      console.log(`  ${filepath}`);
      console.log(`    检测编码: ${detectedInfo}`);
      console.log(`    错误: ${error}`);
    }
  }
  
  // 保存修复文件列表
  if (fixedFiles.length > 0) {
    const report = fixedFiles.map(f => 
      `${f.filepath}\n  检测编码: ${f.detectedInfo}\n  修复为: UTF-8 (无 BOM), 原编码: ${f.originalEncoding}`
    ).join('\n\n');
    fs.writeFileSync('fixed_files.txt', report, 'utf8');
    console.log('\n修复文件列表已保存到 fixed_files.txt');
  }
} else {
  console.log('\n无需修复，所有文件编码正常。');
}
