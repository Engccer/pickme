// file-parsers.js — 다양한 파일 형식 파싱 모듈
// 기존 app.js의 parseCSV/detectFormat/parseGridCSV를 재사용하여
// CSV, TSV, TXT, MD, Excel, DOCX, HWPX, PDF 파일을 파싱한다.

window.FileParsers = {

    // 지원 확장자 → 파서 매핑
    SUPPORTED_EXTENSIONS: {
        '.csv': 'csv',
        '.tsv': 'tsv',
        '.txt': 'txt',
        '.md': 'md',
        '.xlsx': 'excel',
        '.xls': 'excel',
        '.docx': 'docx',
        '.hwpx': 'hwpx',
        '.pdf': 'pdf',
    },

    // 문서 형식 (파싱 결과 확인 안내가 필요한 형식)
    DOCUMENT_FORMATS: new Set(['docx', 'hwpx', 'pdf']),

    /**
     * 메인 디스패처: 파일을 받아서 적절한 파서로 위임
     * @param {File} file
     * @returns {Promise<{students: Array, format: string, warning?: string}>}
     */
    async parseFile(file) {
        const ext = this._getExtension(file.name);
        const parserType = this.SUPPORTED_EXTENSIONS[ext];

        if (!parserType) {
            if (ext === '.hwp') {
                throw new Error('HWP 파일은 지원되지 않습니다. 한컴오피스에서 HWPX로 저장 후 업로드하세요.');
            }
            const supported = Object.keys(this.SUPPORTED_EXTENSIONS).join(', ');
            throw new Error(`지원하지 않는 파일 형식입니다 (${ext}). 지원 형식: ${supported}`);
        }

        const arrayBuffer = await file.arrayBuffer();
        let result;

        switch (parserType) {
            case 'csv':
                result = this._parseCSVFile(arrayBuffer);
                break;
            case 'tsv':
                result = this._parseTSV(arrayBuffer);
                break;
            case 'txt':
                result = this._parseTXT(arrayBuffer);
                break;
            case 'md':
                result = this._parseMD(arrayBuffer);
                break;
            case 'excel':
                result = this._parseExcel(arrayBuffer);
                break;
            case 'docx':
                result = await this._parseDOCX(arrayBuffer);
                break;
            case 'hwpx':
                result = await this._parseHWPX(arrayBuffer);
                break;
            case 'pdf':
                result = await this._parsePDF(arrayBuffer);
                break;
        }

        // 문서 형식이면 경고 추가
        if (this.DOCUMENT_FORMATS.has(parserType) && !result.warning) {
            result.warning = '문서에서 추출한 명단입니다. 미리보기에서 확인해주세요.';
        }

        return result;
    },

    // ── 인코딩 감지 ──

    /**
     * UTF-8 vs EUC-KR 자동 감지
     */
    _detectEncoding(uint8Array) {
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(uint8Array);
            return 'utf-8';
        } catch {
            return 'euc-kr'; // CP949 호환
        }
    },

    /**
     * BOM 처리 + 인코딩 감지 + 디코딩
     */
    _decodeText(arrayBuffer) {
        const uint8Array = new Uint8Array(arrayBuffer);

        // UTF-8 BOM 제거 (EF BB BF)
        let offset = 0;
        if (uint8Array.length >= 3 &&
            uint8Array[0] === 0xEF &&
            uint8Array[1] === 0xBB &&
            uint8Array[2] === 0xBF) {
            offset = 3;
        }
        // UTF-16 LE BOM (FF FE)
        else if (uint8Array.length >= 2 &&
            uint8Array[0] === 0xFF &&
            uint8Array[1] === 0xFE) {
            return new TextDecoder('utf-16le').decode(uint8Array.slice(2));
        }

        const data = uint8Array.slice(offset);
        const encoding = this._detectEncoding(data);
        return new TextDecoder(encoding).decode(data);
    },

    // ── 텍스트 기반 파서 ──

    /**
     * CSV 파일 파싱 (EUC-KR 자동 감지 포함)
     */
    _parseCSVFile(arrayBuffer) {
        const text = this._decodeText(arrayBuffer);
        // 기존 app.js의 parseCSV 호출
        window.parseCSV(text);
        return {
            students: AppState.students,
            format: AppState.detectedFormat
        };
    },

    /**
     * TSV 파싱: 탭을 콤마로 치환 후 기존 parseCSV 호출
     */
    _parseTSV(arrayBuffer) {
        const text = this._decodeText(arrayBuffer);
        const csvText = text.split('\n').map(line => {
            // 탭으로 분리된 각 필드를 CSV로 변환
            // 필드 내 콤마가 있을 수 있으므로 따옴표 처리
            const fields = line.split('\t');
            return fields.map(f => {
                f = f.trim();
                if (f.includes(',') || f.includes('"')) {
                    return '"' + f.replace(/"/g, '""') + '"';
                }
                return f;
            }).join(',');
        }).join('\n');

        window.parseCSV(csvText);
        return {
            students: AppState.students,
            format: AppState.detectedFormat
        };
    },

    /**
     * TXT 파싱: 줄 단위 이름 파싱
     */
    _parseTXT(arrayBuffer) {
        const text = this._decodeText(arrayBuffer);
        return this._parseTextAsStudents(text);
    },

    /**
     * Markdown 파싱: 리스트 마커 제거 후 이름 파싱
     * 마크다운 테이블도 감지
     */
    _parseMD(arrayBuffer) {
        const text = this._decodeText(arrayBuffer);

        // 마크다운 테이블 감지 (| 구분자)
        const lines = text.trim().split('\n').filter(l => l.trim());
        const tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
        if (tableLines.length >= 3) {
            // 구분선(|---|---|) 제거 후 CSV 변환
            const dataLines = tableLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
            if (dataLines.length >= 2) {
                const csvLines = dataLines.map(l =>
                    l.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1)
                        .map(cell => cell.trim())
                        .join(',')
                );
                const csvText = csvLines.join('\n');
                window.parseCSV(csvText);
                if (AppState.students.length > 0) {
                    return {
                        students: AppState.students,
                        format: AppState.detectedFormat
                    };
                }
            }
        }

        // 리스트 마커 제거 후 이름 파싱
        const cleaned = text.replace(/^[\s]*[-*+]\s+/gm, '')     // 비순서 리스트
            .replace(/^[\s]*\d+[.)]\s+/gm, '');  // 순서 리스트
        return this._parseTextAsStudents(cleaned);
    },

    /**
     * 텍스트에서 학생 이름 추출 (TXT/MD/문서 추출 텍스트 공통)
     * 먼저 CSV 형태인지 시도 → 아니면 줄 단위 이름 파싱
     */
    _parseTextAsStudents(text) {
        const lines = text.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) {
            throw new Error('파일에 내용이 없습니다.');
        }

        // CSV 형태인지 시도 (콤마가 포함된 구조화된 데이터)
        const firstLine = lines[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        if (commaCount >= 3 && lines.length >= 2) {
            // CSV로 시도
            window.parseCSV(text);
            if (AppState.students.length > 0) {
                return {
                    students: AppState.students,
                    format: AppState.detectedFormat
                };
            }
        }

        // 줄 단위 이름 파싱 (수동 입력과 동일 방식)
        const students = [];
        let number = 1;
        for (const line of lines) {
            const name = line.trim();
            // 빈 줄, 주석(#), 제목(## 등) 건너뛰기
            if (!name || name.startsWith('#') || name.startsWith('//')) continue;
            students.push({
                grade: '-',
                class: '-',
                number: String(number),
                name: name,
                gender: '-',
                secretPick: false
            });
            number++;
        }

        if (students.length === 0) {
            throw new Error('학생 이름을 찾을 수 없습니다.');
        }

        AppState.students = students;
        AppState.detectedFormat = 'roster';
        return {
            students: students,
            format: 'roster'
        };
    },

    // ── Excel 파서 (SheetJS) ──

    _parseExcel(arrayBuffer, sheetName) {
        if (typeof XLSX === 'undefined') {
            throw new Error('Excel 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도하세요.');
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetNames = workbook.SheetNames;

        // 특정 시트가 지정되었으면 해당 시트 파싱
        const targetName = sheetName || sheetNames[0];
        const sheet = workbook.Sheets[targetName];

        if (!sheet) {
            throw new Error(`시트 "${targetName}"을 찾을 수 없습니다.`);
        }

        // 한국 학교 명렬표 형식 시도
        const result = this._tryParseKoreanRoster(sheet);
        if (result) {
            // 다중 시트 정보 첨부
            if (sheetNames.length > 1) {
                result.sheetNames = sheetNames;
                result.currentSheet = targetName;
            }
            return result;
        }

        // 일반 CSV 변환 후 기존 parseCSV 호출
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        if (!csvText.trim()) {
            throw new Error('Excel 파일에 내용이 없습니다.');
        }

        window.parseCSV(csvText);
        const generalResult = {
            students: AppState.students,
            format: AppState.detectedFormat
        };
        if (sheetNames.length > 1) {
            generalResult.sheetNames = sheetNames;
            generalResult.currentSheet = targetName;
        }
        return generalResult;
    },

    /**
     * Excel 특정 시트 재파싱 (시트 선택 UI에서 호출)
     * @param {ArrayBuffer} arrayBuffer - 원본 파일 데이터
     * @param {string} sheetName - 시트 이름
     */
    parseExcelSheet(arrayBuffer, sheetName) {
        return this._parseExcel(arrayBuffer, sheetName);
    },

    /**
     * 한국 학교 명렬표 형식 감지 및 파싱
     * 패턴: 제목행 → 담임행 → 헤더행(번호, 이름) → 데이터행
     * 시트 이름이 반 번호(101, 102 등)인 경우도 감지
     */
    _tryParseKoreanRoster(sheet) {
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (data.length < 3) return null;

        // "번호" 와 "이름/이 름" 이 포함된 헤더 행 찾기
        let headerRowIdx = -1;
        let numCol = -1;
        let nameCol = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i].map(c => String(c).replace(/\s+/g, ''));
            const ni = row.findIndex(c => c === '번호');
            const nmi = row.findIndex(c => c === '이름' || c === '이름');
            if (ni !== -1 && nmi !== -1) {
                headerRowIdx = i;
                numCol = ni;
                nameCol = nmi;
                break;
            }
        }

        if (headerRowIdx === -1) return null;

        // 학년/반 정보 추출 (헤더 위의 행에서)
        let grade = '-', cls = '-';
        for (let i = 0; i < headerRowIdx; i++) {
            const text = data[i].join(' ');
            const match = text.match(/(\d+)\s*학년\s*(\d+)\s*반/);
            if (match) {
                grade = match[1];
                cls = match[2];
                break;
            }
        }

        // 데이터 행 파싱
        const students = [];
        for (let i = headerRowIdx + 1; i < data.length; i++) {
            const row = data[i];
            const num = String(row[numCol] || '').trim();
            const name = String(row[nameCol] || '').trim();
            // 번호가 숫자이고 이름이 비어있지 않은 경우만
            if (name && /^\d+$/.test(num)) {
                students.push({
                    grade: grade,
                    class: cls,
                    number: num,
                    name: name,
                    gender: '-',
                    secretPick: false
                });
            }
        }

        if (students.length === 0) return null;

        AppState.students = students;
        AppState.detectedFormat = 'roster';
        return {
            students: students,
            format: 'roster'
        };
    },

    // ── DOCX 파서 (JSZip) ──

    async _parseDOCX(arrayBuffer) {
        if (typeof JSZip === 'undefined') {
            throw new Error('문서 파싱 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도하세요.');
        }

        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXml = await zip.file('word/document.xml')?.async('string');
        if (!docXml) {
            throw new Error('DOCX 파일 구조를 읽을 수 없습니다.');
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(docXml, 'application/xml');

        // 테이블 우선 감지
        const tables = doc.getElementsByTagName('w:tbl');
        if (tables.length > 0) {
            const csvText = this._docxTableToCSV(tables[0]);
            if (csvText) {
                window.parseCSV(csvText);
                if (AppState.students.length > 0) {
                    return {
                        students: AppState.students,
                        format: AppState.detectedFormat,
                        warning: '문서의 테이블에서 명단을 추출했습니다. 미리보기에서 확인해주세요.'
                    };
                }
            }
        }

        // 테이블 없으면 문단 텍스트 추출
        const text = this._docxExtractText(doc);
        const result = this._parseTextAsStudents(text);
        result.warning = '문서에서 추출한 명단입니다. 미리보기에서 확인해주세요.';
        return result;
    },

    _docxTableToCSV(table) {
        const rows = table.getElementsByTagName('w:tr');
        const csvLines = [];
        for (const row of rows) {
            const cells = row.getElementsByTagName('w:tc');
            const values = [];
            for (const cell of cells) {
                const texts = [];
                const tElements = cell.getElementsByTagName('w:t');
                for (const t of tElements) {
                    texts.push(t.textContent || '');
                }
                values.push(texts.join(''));
            }
            csvLines.push(values.join(','));
        }
        return csvLines.join('\n');
    },

    _docxExtractText(doc) {
        const paragraphs = doc.getElementsByTagName('w:p');
        const lines = [];
        for (const p of paragraphs) {
            const texts = [];
            const tElements = p.getElementsByTagName('w:t');
            for (const t of tElements) {
                texts.push(t.textContent || '');
            }
            const line = texts.join('').trim();
            if (line) lines.push(line);
        }
        return lines.join('\n');
    },

    // ── HWPX 파서 (JSZip) ──

    async _parseHWPX(arrayBuffer) {
        if (typeof JSZip === 'undefined') {
            throw new Error('문서 파싱 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도하세요.');
        }

        const zip = await JSZip.loadAsync(arrayBuffer);

        // HWPX section 파일 찾기
        const sectionFiles = [];
        zip.forEach((path, entry) => {
            if (path.match(/Contents\/section\d*\.xml$/i)) {
                sectionFiles.push(entry);
            }
        });

        if (sectionFiles.length === 0) {
            throw new Error('HWPX 파일에서 본문을 찾을 수 없습니다.');
        }

        // 모든 섹션의 텍스트를 합침
        let allText = '';
        let foundTable = false;
        let tableResult = null;

        for (const entry of sectionFiles) {
            const xml = await entry.async('string');
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'application/xml');

            // 테이블 우선 감지
            if (!foundTable) {
                const tables = doc.querySelectorAll('tbl');
                // querySelectorAll이 네임스페이스 없이도 찾을 수 있음
                // 없으면 getElementsByTagNameNS로 시도
                let tblElements = tables.length > 0 ? tables :
                    doc.getElementsByTagName('hp:tbl');
                if (tblElements.length === 0) {
                    tblElements = doc.getElementsByTagName('tbl');
                }

                if (tblElements.length > 0) {
                    const csvText = this._hwpxTableToCSV(tblElements[0]);
                    if (csvText) {
                        window.parseCSV(csvText);
                        if (AppState.students.length > 0) {
                            foundTable = true;
                            tableResult = {
                                students: AppState.students,
                                format: AppState.detectedFormat,
                                warning: '문서의 테이블에서 명단을 추출했습니다. 미리보기에서 확인해주세요.'
                            };
                        }
                    }
                }
            }

            // 텍스트 추출 (테이블 미발견 시 사용)
            allText += this._hwpxExtractText(doc) + '\n';
        }

        if (foundTable) return tableResult;

        // 테이블 없으면 텍스트에서 이름 파싱
        const result = this._parseTextAsStudents(allText);
        result.warning = '문서에서 추출한 명단입니다. 미리보기에서 확인해주세요.';
        return result;
    },

    _hwpxTableToCSV(table) {
        // HWPX: <hp:tr> → <hp:tc> → <hp:p> → <hp:t>
        // 네임스페이스가 다양할 수 있으므로 여러 방법 시도
        let rows = table.getElementsByTagName('hp:tr');
        if (rows.length === 0) rows = table.getElementsByTagName('tr');

        const csvLines = [];
        for (const row of rows) {
            let cells = row.getElementsByTagName('hp:tc');
            if (cells.length === 0) cells = row.getElementsByTagName('tc');

            const values = [];
            for (const cell of cells) {
                const texts = [];
                let tElements = cell.getElementsByTagName('hp:t');
                if (tElements.length === 0) tElements = cell.getElementsByTagName('t');
                for (const t of tElements) {
                    texts.push(t.textContent || '');
                }
                values.push(texts.join(''));
            }
            csvLines.push(values.join(','));
        }
        return csvLines.join('\n');
    },

    _hwpxExtractText(doc) {
        // <hp:p> → <hp:t> 또는 <p> → <t>
        let paragraphs = doc.getElementsByTagName('hp:p');
        if (paragraphs.length === 0) paragraphs = doc.getElementsByTagName('p');

        const lines = [];
        for (const p of paragraphs) {
            const texts = [];
            let tElements = p.getElementsByTagName('hp:t');
            if (tElements.length === 0) tElements = p.getElementsByTagName('t');
            for (const t of tElements) {
                texts.push(t.textContent || '');
            }
            const line = texts.join('').trim();
            if (line) lines.push(line);
        }
        return lines.join('\n');
    },

    // ── PDF 파서 (pdf.js 지연 로드) ──

    async _parsePDF(arrayBuffer) {
        // pdf.js 지연 로드
        if (typeof pdfjsLib === 'undefined') {
            await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            } else {
                throw new Error('PDF 라이브러리를 로드할 수 없습니다. 인터넷 연결을 확인하세요.');
            }
        }

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const textLines = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            if (pageText.trim()) {
                textLines.push(pageText.trim());
            }
        }

        if (textLines.length === 0) {
            throw new Error('PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF일 수 있습니다.');
        }

        const fullText = textLines.join('\n');
        const result = this._parseTextAsStudents(fullText);
        result.warning = 'PDF에서 추출한 명단입니다. 미리보기에서 확인해주세요.';
        return result;
    },

    // ── 유틸리티 ──

    _getExtension(filename) {
        const match = filename.match(/\.[^.]+$/);
        return match ? match[0].toLowerCase() : '';
    },

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
            document.head.appendChild(script);
        });
    }
};
