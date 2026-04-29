import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

const DEFAULT_NAME_STYLE = {
  x: 0.5,
  y: 0.4,
  fontSize: 48,
  color: '#000000',
  align: 'center',
  text: '张三',
};

const DEFAULT_WORK_STYLE = {
  x: 0.5,
  y: 0.6,
  fontSize: 36,
  color: '#000000',
  align: 'center',
  text: 'AI未来城市',
};

function App() {
  const [bgImage, setBgImage] = useState(null);
  const [bgWidth, setBgWidth] = useState(0);
  const [bgHeight, setBgHeight] = useState(0);
  const [data, setData] = useState([]);
  const [nameStyle, setNameStyle] = useState(DEFAULT_NAME_STYLE);
  const [workStyle, setWorkStyle] = useState(DEFAULT_WORK_STYLE);
  const [dragging, setDragging] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const bgImgRef = useRef(null);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImgRef.current) return;

    const img = bgImgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const drawText = (style) => {
      const x = style.x * canvas.width;
      const y = style.y * canvas.height;
      ctx.font = `${style.fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif`;
      ctx.fillStyle = style.color;
      // 交换左右对齐以匹配直觉
      const canvasAlign = style.align === 'left' ? 'right' : style.align === 'right' ? 'left' : 'center';
      ctx.textAlign = canvasAlign;
      ctx.textBaseline = 'middle';
      ctx.fillText(style.text, x, y);

      // Draw alignment anchor dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 120, 255, 0.5)';
      ctx.fill();
      ctx.restore();
    };

    drawText(nameStyle);
    drawText(workStyle);
  }, [nameStyle, workStyle]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        bgImgRef.current = img;
        setBgImage(ev.target.result);
        setBgWidth(img.naturalWidth);
        setBgHeight(img.naturalHeight);
        // 立即绘制
        requestAnimationFrame(() => drawCanvas());
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Handle Excel upload
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // Skip header row
      const rows = json.slice(1).filter((r) => r[0] && r[1]);
      setData(rows);
      if (rows.length > 0) {
        setNameStyle((s) => ({ ...s, text: String(rows[0][0]) }));
        setWorkStyle((s) => ({ ...s, text: String(rows[0][1]) }));
        // 立即更新预览
        requestAnimationFrame(() => drawCanvas());
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag handling on canvas
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX) / canvas.width,
      y: ((e.clientY - rect.top) * scaleY) / canvas.height,
    };
  };

  const hitTest = (pos, style) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif`;
    const metrics = ctx.measureText(style.text);
    const textWidth = metrics.width;
    const textHeight = style.fontSize;
    const tx = style.x * canvas.width;
    const ty = style.y * canvas.height;
    const px = pos.x * canvas.width;
    const py = pos.y * canvas.height;

    let left;
    if (style.align === 'center') left = tx - textWidth / 2;
    else if (style.align === 'right') left = tx - textWidth;
    else left = tx;

    const top = ty - textHeight / 2;
    return px >= left - 10 && px <= left + textWidth + 10 && py >= top - 10 && py <= top + textHeight + 10;
  };

  const handleMouseDown = (e) => {
    const pos = getCanvasPos(e);
    if (!pos) return;
    if (hitTest(pos, workStyle)) {
      setDragging('work');
    } else if (hitTest(pos, nameStyle)) {
      setDragging('name');
    }
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    const x = Math.max(0, Math.min(1, pos.x));
    const y = Math.max(0, Math.min(1, pos.y));
    if (dragging === 'name') {
      setNameStyle((s) => ({ ...s, x, y }));
    } else {
      setWorkStyle((s) => ({ ...s, x, y }));
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Generate certificates
  const generateCertificates = async () => {
    if (!bgImgRef.current || data.length === 0) return;
    setGenerating(true);
    setProgress(0);

    const zip = new JSZip();
    const img = bgImgRef.current;
    const offscreen = document.createElement('canvas');
    offscreen.width = img.naturalWidth;
    offscreen.height = img.naturalHeight;
    const ctx = offscreen.getContext('2d');

    for (let i = 0; i < data.length; i++) {
      const [name, work] = data[i];
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(img, 0, 0);

      const drawText = (style, text) => {
        const x = style.x * offscreen.width;
        const y = style.y * offscreen.height;
        ctx.font = `${style.fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif`;
        ctx.fillStyle = style.color;
        // 交换左右对齐以匹配直觉
        const canvasAlign = style.align === 'left' ? 'right' : style.align === 'right' ? 'left' : 'center';
        ctx.textAlign = canvasAlign;
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text), x, y);
      };

      drawText(nameStyle, name);
      drawText(workStyle, work);

      const blob = await new Promise((resolve) => {
        offscreen.toBlob(resolve, 'image/jpeg', 0.95);
      });
      zip.file(`${name}_${work}.jpg`, blob);
      setProgress(Math.round(((i + 1) / data.length) * 100));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, '证书.zip');
    setGenerating(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>电子证书批量生成器</h1>
      </header>

      <div className="app-body">
        {/* Left panel: controls */}
        <aside className="controls">
          <section className="control-section">
            <h3>1. 上传底图</h3>
            <input type="file" accept="image/jpeg,image/png" onChange={handleImageUpload} />
          </section>

          <section className="control-section">
            <h3>2. 上传表格</h3>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
            {data.length > 0 && (
              <p className="data-info">已读取 {data.length} 条数据</p>
            )}
          </section>

          <section className="control-section">
            <h3>3. 姓名样式</h3>
            <div className="control-row">
              <label>字号</label>
              <input
                type="number"
                min="12"
                max="200"
                value={nameStyle.fontSize}
                onChange={(e) => setNameStyle((s) => ({ ...s, fontSize: +e.target.value }))}
              />
            </div>
            <div className="control-row">
              <label>颜色</label>
              <input
                type="color"
                value={nameStyle.color}
                onChange={(e) => setNameStyle((s) => ({ ...s, color: e.target.value }))}
              />
            </div>
            <div className="control-row">
              <label>对齐</label>
              <div className="align-btns">
                {['left', 'center', 'right'].map((a) => (
                  <button
                    key={a}
                    className={nameStyle.align === a ? 'active' : ''}
                    onClick={() => setNameStyle((s) => ({ ...s, align: a }))}
                  >
                    {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="control-section">
            <h3>4. 获奖作品样式</h3>
            <div className="control-row">
              <label>字号</label>
              <input
                type="number"
                min="12"
                max="200"
                value={workStyle.fontSize}
                onChange={(e) => setWorkStyle((s) => ({ ...s, fontSize: +e.target.value }))}
              />
            </div>
            <div className="control-row">
              <label>颜色</label>
              <input
                type="color"
                value={workStyle.color}
                onChange={(e) => setWorkStyle((s) => ({ ...s, color: e.target.value }))}
              />
            </div>
            <div className="control-row">
              <label>对齐</label>
              <div className="align-btns">
                {['left', 'center', 'right'].map((a) => (
                  <button
                    key={a}
                    className={workStyle.align === a ? 'active' : ''}
                    onClick={() => setWorkStyle((s) => ({ ...s, align: a }))}
                  >
                    {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="control-section">
            <h3>5. 批量生成</h3>
            <button
              className="generate-btn"
              disabled={!bgImage || data.length === 0 || generating}
              onClick={generateCertificates}
            >
              {generating ? `生成中 ${progress}%` : '批量生成并下载 ZIP'}
            </button>
            {!bgImage && <p className="hint">请先上传底图</p>}
            {bgImage && data.length === 0 && <p className="hint">请上传表格</p>}
          </section>
        </aside>

        {/* Right panel: canvas preview */}
        <main className="preview" ref={containerRef}>
          {!bgImage ? (
            <div className="placeholder">请上传证书底图</div>
          ) : (
            <canvas
              ref={canvasRef}
              className="preview-canvas"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          )}
          {bgImage && (
            <p className="drag-hint">拖动画布上的文字调整位置</p>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
