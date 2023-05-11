const Path = require("path");
const FS = require("fs")
const nReadlines = require("n-readlines");
const moment = require('moment')
const exceljs = require('exceljs');
const { start } = require("repl");

module.exports.GetFilesFromDirectory = GetFilesFromDirectory
module.exports.GetFilesFromDirectory_SM = GetFilesFromDirectory_SM
module.exports.GetCarrierbagOption = GetCarrierbagOption
module.exports.GetLastTransactionTime = GetLastTransactionTime
module.exports.GetIntegrationBuild = GetIntegrationBuild
module.exports.GetIntegrationBuild_InstallDate = GetIntegrationBuild_InstallDate
module.exports.GetDiagName = GetDiagName
module.exports.GetDiagDateTime = GetDiagDateTimeFromName
module.exports.GetUTCDateFromFile = GetUTCDateFromFile
module.exports.GetTimezoneOffset_Seconds = GetTimezoneOffset_Seconds
module.exports.UpdateSTFWithNewUTC = UpdateSTFWithNewUTC
module.exports.export_excel = export_excel
module.exports.Init_StateName_ID = Init_StateName_ID
module.exports.GetStateNameByID = GetStateNameByID
module.exports.GetLogStartTimes = GetLogStartTimes
module.exports.GetConfigSetting = GetConfigSetting

var _StateNames = new Map()

function GetFilesFromDirectory(Directory, files) {
    FS.readdirSync(Directory).forEach(file => {
        //check if dir
        const abs = Path.join(Directory, file);
        if (FS.statSync(abs).isDirectory()) {
            return GetFilesFromDirectory(abs, files);
        }
        else {
            //process file
            if (Path.basename(abs).toLowerCase() === "scotapp.stf") {
                files.push(abs);
            }
        }
    })

    return files
}

function GetFilesFromDirectory_SM(diag_dir, files) {
    FS.readdirSync(diag_dir).forEach(file => {
        //check if dir
        const abs = Path.join(diag_dir, file);
        if (FS.statSync(abs).isDirectory()) {
            return GetFilesFromDirectory_SM(abs, files);
        }
        else {
            //process file
            if (Path.basename(abs).toLowerCase() === "sm.log") {
                //check .bak first
                let bakFile = `${diag_dir}\\SM.log.BAK`
                if (FS.existsSync(bakFile)) {
                    files.push(bakFile)
                }

                files.push(abs);
            }
        }
    })

    return files
}

function GetLastTransactionTime(dirPath) {
    //check Traces.log
    let fileTraces = dirPath + '\\Traces.log';
    let fileTracesBak = dirPath + '\\Traces.log.bak';
    let result = "";

    result = GetLastTransactionTime2(fileTraces);

    if (result === 'NotFound') {
        //try bak file
        result = GetLastTransactionTime2(fileTracesBak);
    }

    return result;
}

function GetLastTransactionTime2(file) {
    //check Traces.log
    //let file = file + '\\Traces.log';
    if (FS.existsSync(file)) {
        let startTrans = []

        //read content.
        let encoding = getFileEncoding(file);
        let currentLine = ''

        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            if (currentLine.indexOf('Changing state to SMAttract') >= 0) {
                startTrans.push(currentLine);
            }
        }

        if (startTrans.length > 0) {
            //return last detected start, get DateTime
            let line = startTrans.pop()
            let sdate = line.split(' ')[1];
            let stime = line.split(' ')[2].split(';')[0];
            return sdate.toString().replace('/', '.') + '.2022-' + stime.toString().replaceAll(':', '.');
        }
        else {
            return 'NotFound';
        }
    }
    else {
        console.log('File not found! [' + file + ']');
        return 'NotFound';
    }
}

function GetIntegrationBuild(dirPath, extractline = false) {
    let file = dirPath + '\\InstallHistory.log'

    let result = "";
    if (FS.existsSync(file)) {
        let installedApps = []
        let encoding = getFileEncoding(file);

        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            if (currentLine.toLowerCase().indexOf('successfully installed morrisons lane full') >= 0) {
                installedApps.push(currentLine);
            }
        }

        if (installedApps.length > 0) {
            result = installedApps.pop()

            if (extractline) {
                //do nothing, return whole line
            }
            else {
                //get build name only
                let index = result.toLowerCase().indexOf("successfully installed")
                if (index > 0) {
                    result = result.substring(index + 23)
                }
            }
        }
    }

    if (result != "") {
        result.replaceAll(',', ' ')
    }
    return result.trim();
}

function GetIntegrationBuild_InstallDate(dirPath) {
    let file = dirPath + '\\InstallHistory.log'

    let result = "";
    if (FS.existsSync(file)) {
        let installedApps = []
        let encoding = getFileEncoding(file);
        let currentLine = ''

        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            if (currentLine.toLowerCase().indexOf('successfully installed morrisons') >= 0) {
                installedApps.push(currentLine);
            }
        }

        if (installedApps.length > 0) {
            result = installedApps.pop()

            //get build installation date
            let tokens = result.split(' ')
            let d = new Date(`${tokens[0]} ${tokens[1]}`)
            console.log(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`)
            let utcdate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
            return utcdate
        }
    }
    else {
        return ''
    }
}

function GetCarrierbagOption(dirpath) {
    var file = dirpath + '\\scotopts.000'
    var ret = 'N'
    var currentline = ''

    if (FS.existsSync(file)) {
        //read content.
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            if (currentLine.trim().indexOf('SellBagsAtFinalize') == 0) {
                ret = currentLine.split('=')[1].trim()
                break
            }
        }
    }
    return ret
}

function getStringEncoding(line) {
    // https://en.wikipedia.org/wiki/Byte_order_mark
    var e = false;
    if (!e && line[0] === 0xEF && line[1] === 0xBB && line[2] === 0xBF)
        e = 'utf8';
    if (!e && line[0] === 0xFE && line[1] === 0xFF)
        e = 'utf16be';
    if (!e && line[0] === 0xFF && line[1] === 0xFE)
        e = 'utf16le';
    if (!e)
        e = 'ascii';

    return e;
}

function getFileEncoding(f) {
    var d = new Buffer.alloc(5, [0, 0, 0, 0, 0]);
    var fd = FS.openSync(f, 'r');
    FS.readSync(fd, d, 0, 5, 0);
    FS.closeSync(fd);

    // https://en.wikipedia.org/wiki/Byte_order_mark
    var e = false;
    if (!e && d[0] === 0xEF && d[1] === 0xBB && d[2] === 0xBF)
        e = 'utf8';
    if (!e && d[0] === 0xFE && d[1] === 0xFF)
        e = 'utf16be';
    if (!e && d[0] === 0xFF && d[1] === 0xFE)
        e = 'utf16le';
    if (!e)
        e = 'ascii';

    return e;
}

function GetAsciiStringFromReadLine(line, encoding) {
    let currentLine = ''

    if (getStringEncoding(line) != encoding) {
        //make sure buffer does not start with 0
        if (line[0] === 0x00) {
            newBuf = Uint8Array.prototype.slice.call(line, 1);
        }
        else {
            newBuf = line;
        }

        //insert encoding to line
        if (encoding === 'utf16le') {
            const buf = Buffer.from([0xFF, 0xFE])
            const buf2 = Buffer.concat([buf, newBuf]);
            currentLine = buf2.toString(encoding)
        }
    }
    else {
        currentLine = line.toString(encoding)
    }
    return currentLine
}

///Get Start time from log file

function GetUTCDateFromFile(file) {
    var timestamp = ''

    const diagdate = GetDiagDateTimeFromName(GetDiagName(file))

    if (FS.existsSync(file)) {
        //read content.
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            let currentline = GetAsciiStringFromReadLine(line, encoding)
            if (currentline !== '' && currentline.indexOf('(continued)') === -1) {
                timestamp = GetUTCDateTimeFromLine(currentline, diagdate.getUTCFullYear())
                if (timestamp !== '') {
                    break
                }
            }
        }
    }
    return timestamp
}

function GetUTCDateTimeFromLine(line, year = '') {
    let utcTime = ''
    let date = '', time = ''

    let tokens = line.split(' ')

    if (tokens[0].trim() !== '') {
        if (tokens[0].substring(0, 3) === 'SM:') {
            date = tokens[1]
            time = tokens[2]

            if (year !== '') {
                date = `${date}/${year}`
            }

            utcTime = convertDateStringToUTCDate(`${date} ${time}`)
        }
        else if (tokens[0].indexOf('FLM:') || tokens[0].indexOf('POSM:') || tokens[0].indexOf('WPSCO:')) {
            date = `${tokens[0].split(':')[1]}`
            time = tokens[1]
        }
        else {
            //TO DO

        }
    }
    return utcTime
}

function convertDateStringToUTCDate(sdate) {
    var d = new Date(sdate)
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
}

function GetDiagName(file) {
    return Path.basename(Path.dirname(file))
}

function GetDiagDateTimeFromName(diagname) {
    let date = diagname.split('-')[1]
    let time = diagname.split('-')[2]

    return new Date(Date.UTC(`20${date.substring(0, 2)}`, date.substring(2, 4) - 1, date.substring(4, 7), time.substring(0, 2), time.substring(2, 4), time.substring(4, 7)))
}

function GetTimezoneOffset_Seconds(diag_dir) {
    let file = `${diag_dir}\\TerminalInfo.dat`
    let offset = 0
    if (FS.existsSync(file)) {
        //read content.
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            let currentline = GetAsciiStringFromReadLine(line, encoding)
            if (currentline !== '' && currentline.indexOf('System Time') === 1) {
                let index = currentline.indexOf('GMT+')
                let temp_offset = currentline.substring(index + 4, index + 9)

                if (temp_offset.split(':').length === 2) {
                    offset = (parseInt(temp_offset.split(':')[0]) * 3600) + (parseInt(temp_offset.split(':')[1]) * 60)
                }
                break
            }
        }
    }

    return offset
}

function UpdateSTFWithNewUTC(diag_dir, offset_sec, bForceUpdate = false) {
    let file = `${diag_dir}\\Scotapp.stf`
    let newFile = `${diag_dir}\\Scotapp.stf.dat`
    let data = '', temp_data = ''
    let lineNumber = 1

    if (FS.existsSync(file)) {
        //read content.

        //don't run if already ran once
        if (!bForceUpdate && FS.existsSync(newFile)) {
            return
        }

        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            let currentline = GetAsciiStringFromReadLine(line, encoding)

            //change utc time
            let current_time = currentline.split(',')[0]
            let stateID = parseInt(currentline.split(',')[2])

            let m = moment.unix(parseInt(current_time) + offset_sec)
            let m_local = moment.unix(parseInt(current_time) + moment().utcOffset())
            let m2 = m.utc()

            //let new_time = parseInt(current_time) + offset_sec
            //temp_data = currentline.replace(current_time, new_time).trim()
            //insert readable date/time
            //currentline = `${lineNumber}) ${m2.format("MM/DD HH:mm:ss")}  ${currentline} ${GetStateNameByID(stateID).trim()}`
            let lineText = (lineNumber + ')').padEnd(7, ' ')
            let stateText = currentline.split(',')[1].padEnd(20, ' ')
            let stateIDText = GetStateNameByID(stateID).trim().padEnd(25, ' ')

            temp_data = `${lineText} ${m2.format("MM/DD HH:mm:ss")}  ${stateText} ${stateIDText} ${stateID}`
            lineNumber++
            data += `${temp_data}\n`
        }
    }

    //write to file
    FS.writeFileSync(newFile, data);
}

function UpdateSTFWithNewUTC_2(diag_dir, offset_sec, bForceUpdate = false) {
    let file = `${diag_dir}\\Scotapp.stf`
    let newFile = `${diag_dir}\\Scotapp.stf.dat`
    let data = '', temp_data = ''
    let lineNumber = 1

    if (FS.existsSync(file)) {
        //read content.

        //don't run if already ran once
        if (!bForceUpdate && FS.existsSync(newFile)) {
            return
        }

        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            let currentline = GetAsciiStringFromReadLine(line, encoding)

            //change utc time
            let current_time = currentline.split(',')[0]
            let stateID = parseInt(currentline.split(',')[2])

            let m = moment.unix(parseInt(current_time) + offset_sec)
            let m_local = moment.unix(parseInt(current_time) + moment().utcOffset())
            let m2 = m.utc()

            //let new_time = parseInt(current_time) + offset_sec
            //temp_data = currentline.replace(current_time, new_time).trim()
            //insert readable date/time
            //currentline = `${lineNumber}) ${m2.format("MM/DD HH:mm:ss")}  ${currentline} ${GetStateNameByID(stateID).trim()}`
            let lineText = (lineNumber + ')').padEnd(7, ' ')
            let stateText = currentline.split(',')[1].padEnd(20, ' ')
            let stateIDText = GetStateNameByID(stateID).trim().padEnd(25, ' ')

            temp_data = `${lineText} ${m2.format("MM/DD HH:mm:ss")}  ${stateText} ${stateIDText} ${stateID}`
            lineNumber++
            data += `${temp_data}\n`
        }
    }

    //write to file
    FS.writeFileSync(newFile, data);
}


class SmState {
    stateName = ''
    count = 0
    attendantCleared = 0
    tbStates = Map

    constructor(name, ctr = 0, tbstate) {
        this.stateName = name
        this.count = ctr

        this.tbStates = new Map()
        this.tbStates.set(tbstate, 1)
    }

    incrementCount(tbstate = '') {
        this.count++

        if (tbstate !== '') {
            if (this.tbStates.has(tbstate)) {
                this.tbStates.set(tbstate, (this.tbStates.get(tbstate) ?? 0) + 1)
            }
            else {
                this.tbStates.set(tbstate, 1)
            }
        }
    }

    incrementAttendantCleared() {
        this.attendantCleared++
    }
}

module.exports.SmState = SmState

function export_excel(reportName, data) {
    const workbook = new exceljs.Workbook()
    const sheet = workbook.addWorksheet(reportName)

    if (data.size > 0) {
        sheet.columns = [
            { id: 'diag', header: 'Diag', width: 30, style: { font: { size: 10, name: 'calibri' } } },
            { id: 'smstate', header: 'SMSate', width: 30, style: { font: { size: 10, name: 'calibri' } } },
            { id: 'count', header: 'Total', width: 10, style: { font: { size: 10, name: 'calibri' } } },
            { id: 'attendantCleared', header: 'Cleared', width: 10, style: { font: { size: 10, name: 'calibri' } } }
        ]

        //loop through data
        let rowIndex = 0
        data.forEach((value, key) => {
            const rowStart = sheet.addRow([key])
            rowIndex = 1
            let total_count = 0
            let total_cleared = 0

            value.forEach((value2, key2) => {
                if (total_count === 0) {
                    //start of loop
                    rowStart.values = [key, key2, value2.count, value2.attendantCleared]
                    //const row = sheet.addRow([key, key2, value2.count, value2.attendantCleared])
                }
                else {
                    const row = sheet.addRow(['', key2, value2.count, value2.attendantCleared])
                }
                total_count += value2.count
                total_cleared += value2.attendantCleared
            })

            //footer
            const row = sheet.addRow(['', 'Total', total_count, total_cleared])

            //row.border = { top: { style: 'thin' } }
            row.getCell('B').border = { top: { style: 'thin' } }
            row.getCell('C').border = { top: { style: 'thin' } }
            row.getCell('D').border = { top: { style: 'thin' } }
            //row.getCell(`'C${row.number}'`).border = { top: { style: 'thin' } }
            //row.getCell(`'D${row.number}'`).border = { top: { style: 'thin' } }
            //const row2 = sheet.addRow(['', 'Attendant Cleared', total_cleared])
            //row2.border = { bottom: { style: 'thin' } }

            //add blank row
            sheet.addRow([])

            //update total value
            //rowStart.getCell(3).value = total
        })

        sheet.getRow(1).getCell(6).value = "Diag Count"
        sheet.getRow(1).getCell(7).value = data.size

        workbook.xlsx.writeFile('Result.xlsx');
    }
}

function Init_StateName_ID() {
    let data = `TB_CLOSED,
	TB_CMOS_DOSCLOSE,
	TB_CMOS_DOSOPEN,
	TB_CMOS_DOSREAD,
	TB_CMOS_DOSSEEK,
	TB_CMOS_DOSWRITE,
	TB_CMOS_PURGE,
	TB_COMPLETEPRINT,
	TB_COUPONEXCEEDED,
	TB_COUPONNOTMATCH,
	TB_IGNORE,
	TB_INVALIDITEMVOID,
	TB_ITEMQTYEXCEEDED,
	TB_ITEMRECALLED,
	TB_ITEMSOLD,
	TB_ITEMUNKNOWN,
	TB_LOYALTYCARD,
	TB_LOYALTYINVALID,
	TB_NEEDOVERRIDE,
	TB_NEEDPRICE,
	TB_NEEDQUANTITY,
	TB_NEEDTARE,
	TB_NEEDWEIGHT,
	TB_OPTIONLOADING,
	TB_PRINTIMMEDIATE,
	TB_PRINTIMMEDIATECUT,
	TB_READY,
	TB_SECURED,
	TB_TENDERACCEPTED,
	TB_TENDERDECLINED,
	TB_TOTAL,
	TB_TRXEND,
	TB_TRXLIMITEXCEEDED,
	TB_TRXVOIDED,
	TB_TRXVOIDEXCEEDED,
	TB_UNKNOWN,
	TB_VOIDLIMITEXCEEDED,
	TB_VOIDNOTMATCH,
	TB_VOIDITEMBEFORECOUPON,
	TB_TRXSUSPENDED,
	TB_TRXSUSPENSIONUNCOMPLETED,
	TB_TENDERDECLINEDKEEPCARD,
	TB_CASHWAUTHORIZED,
	TB_CASHWNOTAUTHORIZED,
	TB_CASHWCONFIRMED,
	TB_CASHWNOTCONFIRMED,
	TB_CASHWCANCELLED,
	TB_INVALIDPIN,
	TB_EPSOFFLINE,
	TB_EPSSODOK,
	TB_EPSSODNOK,
	TB_EPSEODOK,
	TB_EPSEODNOK,
	TB_TENDERFOODSTAMPINSUFFICIENT,
	TB_FOODSTAMPELIGIBLETOTAL,
	TB_ITEM_QUANTITY_RESTRICTED,
	TB_VISUAL_VERIFY,
	TB_TIMERESTRICTEDITEM,
	TB_TENDERCASHBENEFITINSUFFICIENT,
	TB_ITEMSALECOMPLETED,
	TB_INVALIDAMOUNT,
	TB_EPSONLINE,
	TB_NEWENCRYPTIONKEY,
	TB_INTTRXREPLY,
	TB_ATMPOWERUP,
	TB_ATMOFFLINE,
	TB_ATMONLINE,
	TB_ATMEJPRINTCOMPLETE,
	TB_TENDEREBTINSUFFICIENT,
	TB_MESSAGESCREEN,
	TB_ENTEREDTRAINING,
	TB_LEFTTRAINING,
	TB_TENDERCANCELLED,
	TB_CUSTOMERMESSAGE,
	TB_REWARDLINE,
	TB_CRATEABLEITEM,
	TB_NEEDWEIGHT_BIZERBA,
	TB_SENDMESSAGETOSCOT,
	TB_TRXEND_PRINTANDDISPENSE,
	TB_CLOSED_NOPRINTANDNODISPENSE,
    TB_NEEDMOREDATA,
   TB_NEEDMICR,
   TB_ENDORSEDOCUMENT,
   TB_NEWCASHDRAWERSTATE,
   TB_NEWSECURITYLEVEL,
   TB_DOCUMENTNUM,
   TB_COMPLETEPRINTANDCUT,
   TB_ASSISTMODESTATUSCHANGED,
   TB_PRINTER_VERIFY,
   TB_CREATE_REPORT_ENTRY,
   TB_ASSISTMODETABFLUSH,
   TB_GETBUSINESSDATE, 
   TB_HOSTOFFLINE,
   TB_HOSTONLINE,
   TB_CHANGESTATE,
   TB_OUTOFSYNC_STOP,
   TB_OUTOFSYNC_ASSISTMODE,
   TB_TENDERVOIDED,
   TB_LANECLOSED,
   TB_LANEOPEN,
   TB_REPRINTRECEIPT,
   TB_REPRINTRECEIPTFAILED,
   TB_PREFERENCEDATA,                
   TB_PRINTLINE,
   TB_NEEDSIGNATURE,
   TB_NEEDSIGANDCONFIRM,
   TB_CLEARSLIPDATA,
   TB_NEEDSIGNSLIP,
   TB_CASHMANAGEMENTCOMPLETED,
   TB_TENDERSTARTED,
   TB_READY_TO_TENDER,
   TB_READY_FOR_ITEM,
   TB_GENERIC_DELAYED,
   TB_GENERIC_DELAYED_COMPLETE,
   TB_EVENTDATA`

    let temp = data.split(',')

    _StateNames.set(0, 'TB_BEGIN')
    let _ID = 1
    temp.forEach(item => {
        let _name = item.trim()
        _StateNames.set(_ID, _name)
        _ID++
    })
    _StateNames.set(10000, 'TB_INTEGRATION_STATES')
    _StateNames.set(10001, 'TB_MAXSTATEID')
}

function GetStateNameByID(id) {
    return _StateNames.get(id)
}

function GetLogStartTimes(diag_dir, bForceUpdate = true) {
    let result = ''
    let start_time = ''
    let fileSave = `${diag_dir}\\LogStartTimes.dat`

    if (!bForceUpdate && FS.existsSync(fileSave))
        return

    //Traces
    start_time = GetLogStartTime_File(`${diag_dir}\\Traces.log.bak`)
    if (start_time === '') {
        start_time = GetLogStartTime_File(`${diag_dir}\\Traces.log`)
    }
    result += `Traces -> ${start_time}\n`

    //FLM
    start_time = GetLogStartTime_File(`${diag_dir}\\flm.log.bak`)
    if (start_time === '') {
        start_time = GetLogStartTime_File(`${diag_dir}\\flm.log`)
    }
    result += `FLM -> ${start_time}\n`

    //POSM
    start_time = GetLogStartTime_File(`${diag_dir}\\posm.log.bak`)
    if (start_time === '') {
        start_time = GetLogStartTime_File(`${diag_dir}\\posm.log`)
    }
    result += `POSM -> ${start_time}\n`

    //SM
    start_time = GetLogStartTime_File(`${diag_dir}\\sm.log.bak`)
    if (start_time === '') {
        start_time = GetLogStartTime_File(`${diag_dir}\\sm.log`)
    }
    result += `SM -> ${start_time}\n`

    FS.writeFileSync(fileSave, result)
}

function GetLogStartTime_File(file) {
    let start_time = ''
    let currentline = ''

    //Traces
    if (FS.existsSync(file)) {
        //read content.
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentline = GetAsciiStringFromReadLine(line, encoding)

            start_time = GetDateTimeFromLine(currentline)
            if (start_time !== '') {
                //found date/time
                break;
            }
        }
    }

    return start_time
}

function GetDateTimeFromLine(line) {
    let tokens = line.split(' ')
    let ret_value = ''
    let date_index = -1

    let date = '', time = ''

    if (tokens.length > 3) {
        if (tokens[0].indexOf('/') >= 0) {
            date = tokens[0]
            date_index = 0
        }
        else if (tokens[1].indexOf('/') >= 0) {
            date = tokens[1]
            date_index = 1
        }

        if (date !== '') {
            if (date.indexOf(':') >= 0) {
                date = date.split(':')[1]
            }

            if (Date.parse(date)) {
                time = tokens[date_index + 1]

                if (time.indexOf(';') > 0) {
                    time = time.split(';')[0]
                }

                if (Date.parse(`${date} ${time}`)) {
                    ret_value = `${date} ${time}`
                }
            }

        }
        return ret_value
    }
}

function GetConfigSetting(dirpath) {
    let temp = ''
    let result = '[ScotOpts.000]' + '\n'

    //scotopts
    const items_Scotopts = [
        'DelaySecurityNotificationMilliSecs',
        'BagItemEscalationMilliSecs'
    ]

    let file = dirpath + '\\scotopts.000'
    if (FS.existsSync(file)) {
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            //check for match
            items_Scotopts.forEach(item => {
                if (currentLine.indexOf(item) >= 0) {
                    //match found
                    temp = currentLine.split('=')[1].trim()
                    result += `${item} = ${temp}\n`
                    return
                }
            })
        }
    }

    const items_SecurityConfig = [
        'slow-wt-conclusion-in-not-expecting-timer',
        'default-heavy-wt-limit',
        'default-medium-wt-limit',
        'default-heavy-wt-tolerance',
        'default-medium-wt-tolerance',
        'default-light-wt-tolerance'
    ]

    //securityconfig.xml
    result += '[SecurityConfig.xml]' + '\n'
    file = dirpath + '\\SecurityConfig.xml'
    if (FS.existsSync(file)) {
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            //check for match
            items_SecurityConfig.forEach(item => {
                if (currentLine.indexOf(`<${item}>`) >= 0) {
                    //match found
                    temp = currentLine.split('>')[1].trim()
                    result += `${item} = ${temp}\n`
                    return
                }
            })
        }
    }
    //securityconfig.000
    result += '[SecurityConfig.000]' + '\n'
    file = dirpath + '\\SecurityConfig.000'
    if (FS.existsSync(file)) {
        let encoding = getFileEncoding(file);
        const lines = new nReadlines(file);
        while ((line = lines.next())) {
            currentLine = GetAsciiStringFromReadLine(line, encoding)

            //check for match
            items_SecurityConfig.forEach(item => {
                if (currentLine.indexOf(`<${item}>`) >= 0) {
                    //match found
                    temp = currentLine.split('>')[1].trim()
                    result += `${item} = ${temp}\n`
                    return
                }
            })
        }
    }

    //ConfigEntity-AllLanesCommon.xml
    result += '[ConfigEntity-AllLanesCommon.xml]' + '\n'

    const items_ConfigEntity = [
        'TransPolicy.Tare.1.TareWt',
        'TransPolicy.Tare.1.TareWtTolerance',
        'TransPolicy.Tare.2.TareWt',
        'TransPolicy.Tare.2.TareWtTolerance',
        'TransPolicy.AttractQuietMode',
        'TransPolicy.AttractQuietModeTimeout',
        'TransPolicy.RemovingItemsAutoAdvance',
        'TransPolicy.RemovingItemsAutoAdvanceTimeout'
    ]

    file = dirpath + '\\ConfigEntity-AllLanesCommon.xml'
    if (FS.existsSync(file)) {
        let keyName = ''
        const lines = FS.readFileSync(file).toString().split('\n');

        if (lines.length > 0) {
            lines.forEach(currentLine => {
                //check for match
                if (keyName !== '') {
                    //look for <conf:Value> line
                    if (currentLine.indexOf('<conf:Value>') >= 0) {
                        temp = currentLine.replace('<conf:Value>', '').split('<')[0].trim()
                        result += `${keyName} = ${temp}\n`
                        keyName = ''
                    }
                }
                else {
                    //look for conf:Key
                    items_ConfigEntity.forEach(item => {
                        let matchstring = `conf:Key Name="${item}"`

                        if (currentLine.indexOf(matchstring) >= 0) {
                            //wait for next line to get actual value
                            keyName = item
                            return
                        }
                    })
                }
            })
        }
    }

    return result
}