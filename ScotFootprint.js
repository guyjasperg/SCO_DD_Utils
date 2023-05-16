const Path = require("path");
const FS = require("fs")
const nReadlines = require("n-readlines");
const { time, dir } = require("console");

const helpers = require('./helpers');

let files = []
let states = []
let currentLine, newBuf;
let diag_DateTime, diag_dir

const fileSave = 'FootPrints.csv'
const fileSave2 = 'UnexpectedIncrease.dat'

const BUILD_DD7 = 'Morrisons_LaneSetup-ADK622Release220928E2.1.0.0.11'
const BUILD_DD8 = 'Morrisons_LaneSetup-ADK622Release230209E1.1.0.0.33'
//const BUILD_DD8 = 'Morrisons_LaneSetup-ADK622Release230209E1.1.0.0.33'


const DIR_DD7 = 'C:\\Diags\\Morrisons DeepDive\\DD7'
const DIR_DD8 = 'C:\\Diags\\Morrisons DeepDive\\DD8'
const DIR_DD9 = 'C:\\Diags\\Morrisons DeepDive\\DD9'
const DIR_DD8_1 = 'C:\\Diags\\Morrisons DeepDive\\DD8\\20230331'
//const DIR_MINIDIAGS = 'C:\\Diags\\TakeMiniDiag\\minidiag'
const DIR_GETCONFIG = 'C:\\Diags\\Morrisons DeepDive\\UWIDiag\\GetSettings'
const DIR_MINIDIAGS = 'C:\\Diags\\Morrisons DeepDive\\UWIDiag\\From Paul Dalby\\Mini_Diags'
const DIR_234 = 'C:\\Diags\\Morrisons DeepDive\\UWIDiag\\From Paul Dalby\\234'

//Current filters
const CURRENT_DIAG_FOLDER = DIR_234
const BUILD_MATCH = BUILD_DD8 //Filter diags from specific build only, specify empty string if checking regardless of build
const g_bCheckPreviousBuildData = false //check data before current build?
const g_AttendantClearedOnly = true //list only states that are cleared by attendant

//write detailed info if count reach this level
const UNEXPECTEDINCREASE_COUNT_THRESHOLD = 1

//Start-Main
//******************************************* 
console.log('+Start')
//helpers.Init_StateName_ID()
//GetScoFootprints()
//GetUnexpectedIncreases()
//GetUnexpectedIncreases_MiniDiag()
//GetConfigSettings()
GetItemSoldFromTraces()
console.log('Done...');
//End-Main

function GetScoFootprints() {
    FS.writeFileSync(fileSave, 'Store,Lane,DateTime,Foorprint,Diag,Build\n')

    //Get all .stf files
    //GetFilesFromDirectory(CURRENT_DIAG_FOLDER);
    helpers.GetFilesFromDirectory(CURRENT_DIAG_FOLDER, files)

    if (files.length === 0)
        return

    files.forEach(file => {
        //get directory for current diag
        diag_dir = Path.dirname(file)

        let timezone_offset_sec = helpers.GetTimezoneOffset_Seconds(diag_dir)
        //if (timezone_offset_sec !== 0) {
        //try updating stf file
        helpers.UpdateSTFWithNewUTC(diag_dir, timezone_offset_sec)
        //}

        //Get Store#
        let storeNum = Path.basename(Path.dirname(file)).substring(4, 7);

        //Get Lane#
        let laneNum = Path.basename(Path.dirname(file)).substring(10, 13);

        //read file content for ScotApp.stf file (footprint)
        let data = FS.readFileSync(file).toString().split('\n');
        let footprint = GetLastNStates(data, 5);

        let build = helpers.GetIntegrationBuild(Path.dirname(file))

        if (build != "")
            build.replaceAll(',', ' ')

        //read traces.log to get start time of last transaction
        let transTime = helpers.GetLastTransactionTime(Path.dirname(file));

        let temp = storeNum + ',' + laneNum + ',' + transTime + ',' + footprint + ',' + Path.basename(Path.dirname(file)) + ',' + build;
        console.log(temp);
        FS.appendFileSync(fileSave, temp + '\n');
    });
}

function GetConfigSettings() {
    console.log('+GetConfigSettings()')

    let fileSave = 'ConfigSettings.dat'
    let result = ''

    helpers.GetFilesFromDirectory(CURRENT_DIAG_FOLDER, files)

    if (files.length > 0) {
        files.forEach(file => {
            let diag_Name = helpers.GetDiagName(file)
            let diag_dir = Path.dirname(file)

            let build_no = ''
            let installdate = ''
            let build_line = helpers.GetIntegrationBuild(diag_dir, true)
            if (build_line !== '') {
                //extract data
                build_no = build_line.substring(build_line.toLowerCase().indexOf('morrisons_lanesetup'))

                //extract install date
                var tokens = build_line.split(' ')
                installdate = convertDateStringToUTCDate(`${tokens[0]} ${tokens[1]}`)
            }
            else {
                //unable to get build number
            }

            result += `${diag_Name} - ${build_no}\n`
            const configsettings = helpers.GetConfigSetting(diag_dir)

            result += configsettings + '\n'
        })
    }

    //save to file
    FS.writeFileSync(fileSave, result)

    console.log('-GetConfigSettings()')

}


function GetItemSoldFromTraces() {
    console.log('+GetItemSoldFromTraces')
    let bDontLogDuplicateDiag = true
    let occurrence = 0

    helpers.GetFilesFromDirectory_SM(CURRENT_DIAG_FOLDER, files, 'Traces')

    if (files.length > 0) {
        let fileSave = 'ItemSold.txt'
        let result = ''

        //process files
        let currentDiagName = ''
        files.forEach(file => {
            let diagName = helpers.GetDiagName(file)
            if (currentDiagName !== diagName) {
                //new diag
                occurrence = 0
                if (result !== '')
                    result += '\n'

                result += diagName + '\n'
                currentDiagName = diagName

                console.log(currentDiagName)
            }
            else {
                //continuation
            }

            //read file content
            let data = helpers.ReadFileAsString(file).split('\n')

            //check each line for occurrence
            let item_description = ''
            let time_start = ''
            let time_end = ''

            if (data.length > 0) {
                data.forEach(line => {
                    if (helpers.IsMatchCriteria_ItemSold(line)) {
                        occurrence++
                        item_description = ''

                        //start scan?
                        if (line.indexOf('+isBarcodeValidOperatorPassword') > 0) {
                            time_start = helpers.GetDateTimeFromLine_ticks(line)

                            //add new line
                            result += '\n'
                        }

                        //Get end time if receive ITEM_SOLD
                        else if (line.indexOf('!!!! TB State id=15, name:ITEMSOLD') > 0 && time_start !== '') {
                            time_end = helpers.GetDateTimeFromLine_ticks(line)
                        }

                        if (line.indexOf('TBGetItemDetails--ItemDetail:') > 0) {
                            //get item description
                            let i = line.indexOf('szDescription:')
                            if (i > 0) {
                                //get the description
                                let ii = line.indexOf(';', i + 1)
                                if (ii > i) {
                                    item_description = line.substring(i + 14, ii)

                                    if (time_start !== '' && time_end !== '') {
                                        //insert time from scan to ITEM_SOLD
                                        //item_description += ` Time ${time_start} - ${time_end} [${parseInt(time_end) - parseInt(time_start)}]`
                                        item_description += ` - [${parseInt(time_end) - parseInt(time_start)}]`
                                        time_start = ''
                                        time_end = ''
                                    }
                                }
                            }
                        }
                        else if (line.indexOf('TBEnterItem--ItemDetail:') > 0) {
                            //truncate line to not clutter result
                            let i = line.indexOf('io.lWeightEntered:')
                            line = line.substring(0, i).trim()
                        }
                        else {
                            line = line.trim()
                        }

                        if (item_description !== '') {
                            line = `Item Description: ${item_description}`
                            item_description = ''
                        }

                        if (bDontLogDuplicateDiag && occurrence >= 2) {
                            // let diagname = ''.padEnd(27, ' ')
                            // result += `    ,   ,${diagname},${line}\n`
                            result += `${line}\n`
                        }
                        else {
                            //result += `${store},${lane},${currentDiagName},${line}\n`
                            result += `${line}\n`
                        }
                    }
                })
                //result += '\n'
            }
        })

        FS.writeFileSync(fileSave, result)
    }
    console.log('-GetItemSoldFromTraces')
}

function GetUnexpectedIncreases_MiniDiag() {
    helpers.GetFilesFromDirectory_SM(CURRENT_DIAG_FOLDER, files, 'SM')

    if (files.length > 0) {
        let fileSave = 'WeightIncreaseExceptions.txt'
        let result = ''
        let occurrence = 0

        //process files
        let currentDiagName = ''
        files.forEach(file => {
            let diagName = helpers.GetDiagName(file)
            if (currentDiagName !== diagName) {
                //new diag
                occurrence = 0
                if (result !== '')
                    result += '\n'

                result += diagName + '\n'
                currentDiagName = diagName
            }
            else {
                //continuation

            }

            //read file content
            let data = FS.readFileSync(file).toString().split('\n');

            //check each line for occurrence
            if (data.length > 0) {
                data.forEach(line => {
                    if (line.indexOf('> fastlane::GenerateException:') > 0 &&
                        line.indexOf('=unexpected-increase;') > 0) {
                        occurrence++
                        line = line.replaceAll(',', '').trim()
                        if (occurrence > 1)
                            result += ',\n'

                        result += line
                    }
                })
                //result += '\n'
            }
        })

        FS.writeFileSync(fileSave, result)
    }
}

function GetUnexpectedIncreases() {
    console.log('+GetUnexpectedIncreases()')

    //Get all .stf files
    //GetFilesFromDirectory(CURRENT_DIAG_FOLDER);
    helpers.GetFilesFromDirectory(CURRENT_DIAG_FOLDER, files)

    if (files.length === 0)
        return

    const mapStates = new Map()
    const mapStates_obj = new Map()
    const map_for_excel = new Map()

    var mapOwnBagStates = []
    var mapSellbagsStates = []

    let lastState = ''
    let lastStateBeforeIncrease = ''
    let resultLog = ''
    let bagFlowResult = ''
    let currentResult = ''
    let attendantCleared = 0
    let shopperCleared = 0
    let ownBagFlow = 0
    let unexpectexIncreaseState = 0
    let index = 0

    let lst_capturedInLogs = []

    files.forEach(file => {
        index++
        console.log(`[${index}] ${file}`)

        //get directory for current diag
        diag_dir = Path.dirname(file)

        helpers.GetLogStartTimes(diag_dir, false)

        let timezone_offset_sec = helpers.GetTimezoneOffset_Seconds(diag_dir)
        //if (timezone_offset_sec !== 0) {
        //try updating stf file
        helpers.UpdateSTFWithNewUTC(diag_dir, timezone_offset_sec, false)
        //}

        //get diag DateTime
        let diagname = helpers.GetDiagName(file)
        diag_DateTime = helpers.GetDiagDateTime(diagname)

        //prepare logfile data
        bagFlowResult += file + '\n'
        if (resultLog === '') {
            //header
            resultLog = '[UnexpectedIncrease Instances]\n'
            resultLog += 'Processing diags from [' + CURRENT_DIAG_FOLDER + ']\n'

            if (BUILD_MATCH !== '') {
                resultLog += `Build: ${BUILD_MATCH}\n\n`
            }
        }

        //get build number
        let build_no = ''
        let installdate = ''
        let build_line = helpers.GetIntegrationBuild(diag_dir, true)
        if (build_line !== '') {
            //extract data
            build_no = build_line.substring(build_line.toLowerCase().indexOf('morrisons_lanesetup'))

            //extract install date
            var tokens = build_line.split(' ')
            installdate = convertDateStringToUTCDate(`${tokens[0]} ${tokens[1]}`)
        }
        else {
            //unable to get build number
        }
        const CarrierBagFlag = helpers.GetCarrierbagOption(diag_dir)

        resultLog += `[${index}] ${Path.basename(Path.dirname(file))} `
        //currentResult = `[${index}] ${Path.basename(Path.dirname(file))}\n`

        if (BUILD_MATCH != '' && build_no != BUILD_MATCH) {
            //exclude this diag, wrong build
            resultLog += `\n--SKIPPED-- [${build_no}]\n\n`
            bagFlowResult += '--SKIPPED--\n\n'
            console.log(build_no)
            console.log('--SKIPPED--')
            return
        }

        //get beginning time in Traces.log.bak so that we can tell if the unexpected increase event is captured in Traces logs

        //read file content for ScotApp.stf file (footprint)
        let data = FS.readFileSync(file).toString().split('\n');

        if (data.length > 0) {
            mapStates.clear()
            mapStates_obj.clear()
            mapOwnBagStates.length = 0
            mapSellbagsStates.length = 0
            attendantCleared = 0
            shopperCleared = 0
            ownBagFlow = 0
            sellBagsFlow = 0
            unexpectexIncreaseState = 0
            ctr_capturedInLog = 0
            bCheckTimeStamp = true
            lastState = ''
            lastStateBeforeIncrease = ''
            stf_start = ''
            stf_end = ''

            //get SM log start time
            let logfile = ''
            if (FS.existsSync(`${diag_dir}\\SM.log.bak`)) {
                logfile = `${diag_dir}\\SM.log.bak`
            }
            else {
                logfile = `${diag_dir}\\SM.log`
            }
            let sm_starttime = helpers.GetUTCDateFromFile(logfile)
            let sm_starttime_i = 0
            if (sm_starttime !== '') {
                sm_starttime_i = (sm_starttime.getTime() / 1000) + timezone_offset_sec
            }

            //process each line of the .stf file
            data.forEach(line => {
                let currentstate = line.split(',')[1]
                let TB_STATE_NAME = helpers.GetStateNameByID(parseInt(line.split(',')[2]))

                if (line.trim() !== '') {
                    if (stf_start === '') {
                        stf_start = line.split(',')[0]
                    }
                    else {
                        stf_end = line.split(',')[0]
                    }
                }

                //count only data after installation
                if (installdate !== '' && bCheckTimeStamp) {
                    var timestamp = new Date(parseInt(line.split(',')[0]) * 1000)

                    if (g_bCheckPreviousBuildData) {
                        if (timestamp > installdate) {
                            stf_end = installdate
                            return
                        }
                    }
                    else {
                        if (timestamp < installdate) {
                            return
                        }
                        //no need to check succeeding lines
                        bCheckTimeStamp = false
                    }
                }

                if (currentstate === 'SMPutBagOnScale') {
                    mapOwnBagStates.length = 0
                    mapOwnBagStates.push(currentstate)
                }
                else if (mapOwnBagStates.length >= 1) {
                    //Own Bag scenario
                    if (mapOwnBagStates.length >= 3) {
                        //invalid?
                        mapOwnBagStates.length = 0
                    }
                    else {
                        mapOwnBagStates.push(currentstate)
                    }
                }

                if (currentstate === 'SMSellBags') {
                    mapSellbagsStates.length = 0
                    mapSellbagsStates.push(currentstate)
                }
                else if (mapSellbagsStates.length >= 1) {
                    //Own Bag scenario
                    if (mapSellbagsStates.length >= 9) {
                        //invalid?
                        mapSellbagsStates.length = 0
                    }
                    else {
                        mapSellbagsStates.push(currentstate)
                    }
                }

                if (currentstate === 'SMSecUXIncreaseAttendantCleared') {
                    attendantCleared++

                    //also update count of state where UWI occurred
                    if (lastStateBeforeIncrease !== '') {
                        mapStates_obj.get(lastStateBeforeIncrease).incrementAttendantCleared()
                    }
                    lastStateBeforeIncrease = ''
                } else if (currentstate === 'SMSecUXIncreaseShopperCleared') {
                    shopperCleared++
                }

                if (lastState === '') {
                    lastState = currentstate
                } else {
                    if (lastState === currentstate && currentstate === 'SMScanAndbag') {
                        let x = 0
                    }

                    //Unexpected increase->SMFinish

                    if (currentstate === 'SMSecUnExpectedIncrease') {
                        //found instance
                        unexpectexIncreaseState++
                        if (mapStates.has(lastState)) {
                            mapStates.set(lastState, (mapStates.get(lastState) ?? 0) + 1)

                            mapStates_obj.get(lastState).incrementCount(TB_STATE_NAME)
                        }
                        else {
                            //add new
                            mapStates.set(lastState, 1)

                            let newState = new helpers.SmState(lastState, 1, TB_STATE_NAME)
                            mapStates_obj.set(lastState, newState)
                        }

                        //reset
                        lastStateBeforeIncrease = lastState
                        lastState = ''

                        if (line.split(',')[0] >= sm_starttime_i) {
                            ctr_capturedInLog++
                        }

                        //own bag scenario
                        if (mapOwnBagStates.length >= 1) {
                            bagFlowResult += currentstate + '\n'
                            bagFlowResult += '--own bag flow--\n'

                            console.log(currentstate)
                            console.log("--own bag flow--")
                            mapOwnBagStates.forEach(state => {
                                console.log(state)
                                bagFlowResult += state + '\n'
                            })
                            ownBagFlow++
                            mapOwnBagStates.length = 0
                        }

                        //sellbags flow
                        if (mapSellbagsStates.length >= 1) {
                            bagFlowResult += currentstate + '\n'
                            bagFlowResult += '--sellbags flow--\n'

                            console.log(currentstate)
                            console.log("--sellbags flow--")
                            mapSellbagsStates.forEach(state => {
                                console.log(state)
                                bagFlowResult += state + '\n'
                            })
                            sellBagsFlow++
                            mapSellbagsStates.length = 0
                        }
                    }
                    else {
                        //continue
                        lastState = currentstate
                    }
                }
            })
        }

        if (typeof (stf_end) !== 'string')
            stf_end = stf_end.getTime() / 1000

        resultLog += ' -> ' + unexpectexIncreaseState + `\t[${stf_start} - ${stf_end}] SellBagsAtFinalize: ${CarrierBagFlag}\n`
        resultLog += 'Total Instance, ' + unexpectexIncreaseState + '\n'
        resultLog += 'CapturedInLogs: ' + ctr_capturedInLog + '\n'

        //Only write detailed log if ctr is high
        if (unexpectexIncreaseState >= UNEXPECTEDINCREASE_COUNT_THRESHOLD) {
            //write diag file
            resultLog += `Timestamp: ${stf_start} - ${stf_end}, SellBagsAtFinalize: ${CarrierBagFlag} InstallDate: ${installdate.getTime() / 1000}\n`
            resultLog += '----------------------------------\n'
            resultLog += 'Attendant Cleared, ' + attendantCleared + '\n'
            resultLog += 'Shopper Cleared, ' + shopperCleared + '\n'
            //resultLog += 'Own Bag Flow, ' + ownBagFlow + '\n'
            //resultLog += 'Sell Bags Flow, ' + sellBagsFlow + '\n'
            resultLog += '----------------------------------\n'

            if (mapStates_obj.size > 0) {
                const newMap2 = new Map(Array.from(mapStates_obj).sort((a, b) => b[1].count - a[1].count))
                newMap2.forEach((value, key) => {
                    if (g_AttendantClearedOnly) {
                        //log only if attendant cleared
                        if (value.attendantCleared > 0) {
                            resultLog += key + ',' + value.attendantCleared + '\n'
                        }
                    }
                    else {
                        resultLog += key + ',' + value.count + ',' + value.attendantCleared + '\n'
                    }
                })

                map_for_excel.set(diagname, newMap2)
            } else {
                resultLog += '[None]\n'
            }

            resultLog += '\n\n'
        }
        else {
            resultLog += '\n\n'
        }

        if (ctr_capturedInLog > 0) {
            lst_capturedInLogs.push(Path.basename(diagname))
            ctr_capturedInLog = 0
        }
    })

    if (map_for_excel.size > 0) {
        helpers.export_excel('DD8', map_for_excel)
    }

    if (lst_capturedInLogs.length > 0) {
        resultLog += '*************************************************\n'
        resultLog += `Diags with UnexpectedIncrease in SM.log [${lst_capturedInLogs.length}]\n`
        resultLog += '*************************************************\n'
        let ctr = 1
        lst_capturedInLogs.forEach(diag => {
            //resultLog += `[${ctr}] ${diag}\n`
            resultLog += `${diag}\n`
            ctr++
        })
    }

    //save result to file
    FS.writeFileSync(fileSave2, resultLog + '\n');
    FS.writeFileSync('BagFlowResult.dat', bagFlowResult)

    console.log('-GetUnexpectedIncreases()')
}

function GetLastNStates(lines, nStates) {
    //var index = lines.length - nStates;
    var footPrint = "";

    let index = 1;
    states.length = 0;
    try {
        while (states.length < nStates) {
            var line = lines[lines.length - index];
            if (line != "" && line.split(',').length === 3) {
                //get statename
                let statename = line.split(',')[1];

                states.push(statename);
            }
            index++;
        }


    } catch (error) {
        //Do nothing
        states.push('[error]')
    }
    //got all needed states
    while (states.length > 0) {
        let statename = states.pop();

        if (footPrint != "")
            footPrint += '|';

        footPrint += statename;
    }
    return footPrint;
    //console.log(footPrint);
}

function GetLastInstalledApp(fileDir) {
    let file = fileDir + '\\InstallHistory.log'
}

function convertDateStringToUTCDate(sdate) {
    var d = new Date(sdate)
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
}