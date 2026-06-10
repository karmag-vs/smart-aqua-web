// stažení knihovny pro zobrazení grafu
/*if (typeof google !== 'undefined' && document.getElementById('temp_chart_div')) {
    google.charts.load('current', {'packages':['corechart']});
}*/

// Načte knihovnu vždy, když je v HTML přítomen loader.js
if (typeof google !== 'undefined') {
    google.charts.load('current', {'packages':['corechart']});
    //console.log("Google Charts: Knihovna se začala načítat...");
} else {
    console.log("Google Charts: V HTML chybí <script> tag pro loader.js!");
}

//=====================================
// GLOBALNI PROMENNE
//=====================================
let currentEditingLed = 1; // Globální proměnná pro sledování, kterou LED ladíme
let lastStatus = {      // Globální objekt, kde si refreshAllData uloží poslední stavy
    1: 0,               // % slider 1    
    2: 0                // % slider 2  
};
let isUserDragging = false; // Zabraňuje „přetahování“ o slider mezi tebou a ESP32
let currentChartType = "";  // Globální proměnná pro zapamatování senzoru (TC, TW, atd.)
let currentChartColor = ""; // Výchozí barva (zelená)
let serverTimeOffset = 0;   // Rozdíl mezi časem v PC a v ESP32

const sensorConfig = {
    0: { name: "TEPL.KRYT",  unit: "°C",    color: "#6fa8dc",  id: "TC"},
    1: { name: "VLHKOST",  unit: "%",     color: "#bcbcbc",  id: "HC"},
    2: { name: "TEPL.VODA",  unit: "°C",    color: "#3498db",  id: "TW"},
    3: { name: "PH VODA", unit: "pH",    color: "#2ecc71",  id: "PH"},
    4: { name: "PRŮTOK",   unit: "l/min", color: "#1dd1a1",  id: "QF"},
    5: { name: "HLADINA",  unit: "cm",    color: "#54a0ff",  id: "WL"}
};
const deviceNames = ["DIAG", "KRMENÍ 1", "KRMENÍ 2"];
//==============================================================================
// ZOBRAZENI MENU
//==============================================================================
function toggleMenu() {
    document.getElementById("mySidebar").classList.toggle("open");
    document.getElementById("overlay").classList.toggle("show");
}			

function createNavbar() {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return; // Pokud prvek neexistuje, ukonči funkci a nepokračuj
    const pageTitles = {
        "index.html": "AQUA CS",      // vloží se jako titulek stránky
        "LED1.html" : "LED 1",
        "LED2.html" : "LED 2",
        "TC.html"   : "TEPLOTA KRYT",
        "HC.html"   : "VLHKOST KRYT",        
        "TW.html"   : "TEPLOTA VODA",
        "PHCO2.html": "PH VODA - CO2",
        "WL.html"   : "HLADINA",
        "QF.html"   : "PRŮTOK",
        "note.html" : "DENÍK ÚDRŽBY",
        "settings.html": "NASTAVENÍ",
        "alarm.html": "PORUCHY",
        "feeder.html" : "KRMENÍ",
		"fertdoser.html" : "DÁVK.HNOJENÍ"
    };
    const currentFile = window.location.pathname.split("/").pop() || "index.html";
    const dynamicTitle = pageTitles[currentFile] || "SMART AQUA";

    const navHTML = `
    <div class="top-header">
        <div class="header-left-section">
            <!--div class="hamburger" onclick="toggleMenu()">
                <i class="fas fa-bars"></i>
            </div-->
            <div class="header-brand">
                <div class="header-status-icons">
                    <i id="feederIcon" class="fas fa-fish"></i>
                    <i id="fertIcon" class="fas fa-flask"></i> 
                </div>
                <div class="header-title">${dynamicTitle}</div>
            </div>
        </div>
        <div style="display: flex; align-items: center;">
            <div class="header-datetime">
                <div id="header-date" class="date-row">--.--.----</div>
                <div id="header-time" class="time-row">--:--:--</div>
            </div>
            <div class="header-home">
                <a href="index.html"><i class="fas fa-home"></i></a>
            </div>
        </div>    
    </div>
	<!--
    <div id="mySidebar" class="sidebar">
        <div class="sidebar-header">
            <h3>MENU</h3>
            <hr>
        </div>
        <a href="index.html"><i class="fas fa-home"></i> PŘEHLED</a>
        <a href="LED1.html"><i class="fas fa-sun"></i> LED 1</a>
        <a href="LED2.html"><i class="fas fa-sun"></i> LED 2</a>
        <a href="settings.html"><i class="fas fa-cog"></i> NASTAVENÍ</a>
        <a href="note.html"><i class="fas fa-clipboard-list"></i> POZNÁMKY</a>
        <a href="feeder.html"><i class="fas fa-fish"></i> KRMENÍ</a>
		<a href="fertdoser.html"><i class="fas fa-flask"></i> DÁVKOVAČ</a>
        <a href="alarm.html"><i class="fas fa-exclamation-triangle"></i> PORUCHY</a>
    </div>
	-->
    <div id="overlay" class="overlay" onclick="toggleMenu()"></div>
    `;
    
    placeholder.innerHTML = navHTML;
    // Automatické zvýraznění aktivní stránky
    highlightActiveLink();
}

function highlightActiveLink() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const links = document.querySelectorAll('.sidebar a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
}
//==============================================================================
// ZAPATI STRANKY
//==============================================================================
function createFooter() {
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return; // Pokud prvek neexistuje, ukonči funkci a nepokračuj
    
    const year = new Date().getFullYear();
    const footerHTML = `
    <footer class="main-footer">
        <div class="footer-content">
            <p>
                &copy; ${year} 
                <img src="aqua.svg" class="footer-logo" alt="logo">
                <strong>ESP AQUARIUM CS</strong>&nbsp;&nbsp;Verze <span id="info-sw">---</span>
            <p>
            <p>
                <i class="fas fa-microchip"></i> <span id="info-hw">---</span>&nbsp;&nbsp;
                <i class="fas fa-code"></i> K2IR
            </p>
        </div>
    </footer>`;
    placeholder.innerHTML = footerHTML;
}
//==============================================================================
// SYSTEM INFO
//==============================================================================
function loadSystemInfo() {
    // Pokud už info máme v paměti prohlížeče, netrapme ESP32 dalším požadavkem
    const cachedSw = sessionStorage.getItem('info-sw');
    const cachedHw = sessionStorage.getItem('info-hw');

    if (cachedSw && cachedHw) {
        if (document.getElementById('info-sw')) document.getElementById('info-sw').innerText = cachedSw;
        if (document.getElementById('info-hw')) document.getElementById('info-hw').innerText = cachedHw;
        return;
    }
    fetch('/getSystemInfo')
        .then(response => response.json())
        .then(data => {
            sessionStorage.setItem('info-sw', data.sw_ver);
            sessionStorage.setItem('info-hw', data.hw_ver);
            const swEl = document.getElementById('info-sw');
            const hwEl = document.getElementById('info-hw');
            
            if (swEl) swEl.innerText = data.sw_ver;
            if (hwEl) hwEl.innerText = data.hw_ver;
        })
        .catch(err => console.error("Chyba při načítání info:", err));
}

//==============================================================================
// VOLANI FUNKCI
//==============================================================================
window.addEventListener('load', () => {
    createNavbar(); // hlavička stránky + menu
    createFooter(); // patička
    createModals(); // vyskakovací okna (grafy, nastavení senzorů)
    loadSystemInfo();
    setInterval(updateClock, 1000);
    refreshAllData();
    setInterval(refreshAllData, 5000);
});

//==============================================================================
// HODINY
//==============================================================================
function updateClock() {
    const dateEl = document.getElementById('header-date');
    const timeEl = document.getElementById('header-time');
    if (!dateEl || !timeEl) return;

    // Vypočítáme aktuální čas v ESP32 na základě offsetu (synchronizovaného v refreshAllData)
    const now = new Date(Date.now() + serverTimeOffset);
    
    // Formát ČASU
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    // Formát DATUMU
    const DD = String(now.getDate()).padStart(2, '0');
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const YYYY = now.getFullYear();

    // Vložení do HTML
    dateEl.innerText = `${DD}.${MM}.${YYYY}`;
    timeEl.innerText = `${hh}:${mm}:${ss}`;
}

//==============================================================================
// NACTI VSECHNA DATA
//==============================================================================
async function refreshAllData() {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            try {
                const data = JSON.parse(this.responseText);

                // Mapování JSON dat na ID prvků v HTML
                updateElement("tempCover", data.tempCover , 1);
                updateElement("humCover", data.humCover , 0);
                updateElement("AVled1", data.AVled1);
                updateElement("SPled1", data.SPled1);
                updateElement("AVled2", data.AVled2);
                updateElement("SPled2", data.SPled2);
                updateElement("tempWater", data.tempWater , 1);
                updateElement("SPtempWater", data.SPtempWater , 1);
                updateElement("phWater", data.phWater , 1);
                updateElement("SPphWater", data.SPphWater , 1);
                updateElement("levelWater", data.levelWater , 1);
                updateElement("flowWater", data.flowWater , 1);
                updateElement("AVchanges", data.AVchgs , 1);
                //updateElement("TMchanges", data.TMchgs , 1);
                let tmVal = Number(data.TMchgs);
                let tmDecimals = (tmVal < 10.0) ? 1 : 0;
                updateElement("TMchanges", data.TMchgs, tmDecimals);
                updateElement("ntpTime", data.ntpTime);
                updateElement("alarmNo", data.alarmNo);
                updateElement("dKH", data.dKH, 1);
                updateElement("co2W", data.co2W);

                //updateElement("feederOnline", data.feederOnline);
                //updateElement("feederA1", data.feederA1);
                //updateElement("feederA2", data.feederA2);
				updateElement("feedStat", data.feedStat);
                const flagFeeder = data.feedStat;
 				updateElement("fertStat", data.fertStat);
				const flagFert = data.fertStat;
				
				const bell1 = document.getElementById("bell1");	// Kontrola stranky FEED
				const bell2 = document.getElementById("bell2");	
				if (bell1) {
					bell1.style.color  = (flagFeeder & (1 << 1)) ? "#2ecc71" : "Grey";	// ikona 1
					bell2.style.color  = (flagFeeder & (1 << 2)) ? "#2ecc71" : "Grey";	// ikona 2
					updateElement("feedDose1", data.feedD1);		// davka c.1 hh:mm
					updateElement("feedDose2", data.feedD2);		// davka c.2 hh:mm
					updateElement("totalDoses", data.totD);         // celkem davek
					updateElement("currDose", data.currD);          // aktual. davka krmitka
					updateElement("currSubDose", data.currSD);		// aktul. subdavka
					updateElement("totalSubDoses", data.totSD);		// celkem subdavek
				}
 
                // Ikona krmítka (Feeder)
                if (data.feedStat !== undefined) {
                    const feederIcon = document.getElementById("feederIcon");
                    if (feederIcon) {
                        // Nejdříve odebereme všechny stavové třídy
                        feederIcon.classList.remove("feeder-offline", "feeder-error", 
													"feeder-active", "feeder-empty");
                        if (!(flagFeeder & (1 << 7))) {				// Bit 7: Povolení
                            feederIcon.classList.add("feeder-offline");
                            feederIcon.title = "Krmítko: Offline (odpojeno)";
                        } else {
                            if ((flagFeeder & (1 << 0)) !== 0) {	// Bit 0: krmitko online = 1
                                if (!(flagFeeder & (1 << 6))) {		// Bit 6: krmitko prazdne = 1
									feederIcon.classList.add("feeder-active");
									feederIcon.title = "Krmítko: Online";
                                } else {    
									feederIcon.classList.add("feeder-empty");
									feederIcon.title = "Krmítko: Prázdné";
                                }
                            } else {
                                feederIcon.classList.add("feeder-error");
                                feederIcon.title = "Krmítko: Online (POZOR: Žádná dávka není povolena!)";
                            }
                        }
                    }
                }
				
                // Davkovani hnojiva (Fertilizer) - ikona
				if (data.fertStat !== undefined) {
					const fertIcon = document.getElementById("fertIcon");
					if (fertIcon) {
						fertIcon.classList.remove("feeder-offline", "feeder-error", 
													"feeder-active", "feeder-empty");
						if (!(flagFert & (1 << 7))) {				// Bit 7: 0 = offline (seda)		
							fertIcon.classList.add("feeder-offline");
							fertIcon.title = "Fertilizer: Offline";
							//fertIcon.style.opacity = "1";
						} else {
							if (!(flagFert & (1 << 6))) {			// Bit 6: prazna lahev
								fertIcon.classList.add("feeder-active");
								fertIcon.title = "Fertilizer: Online";
								//fertIcon.style.opacity = "0.4";
							} else {    
								fertIcon.classList.add("feeder-empty");
								fertIcon.title = "Fertilizer: Prázdné";
							}	
						}
					}
				}
				
				// HODINY v zahlavi stranky
                if (data.datetime) {                                
                    serverTimeOffset = (data.datetime * 1000) - Date.now(); // Spočítáme rozdíl mezi časem v prohlížeči a v ESP32
                }
                
				// ALARM	
                const icon = document.getElementById("alarmIcon");  // Změna barvy ikony "ALARM" podle hodnoty alarmu
                if (icon) {
                    // Převedeme na číslo, aby nás nepřekvapilo, že ESP pošle "0" jako text
                    if (Number(data.alarmNo) > 0) {
                        icon.style.color = "red"; 
                        icon.classList.add("fa-blink"); // přidání animace blikání
                    } else {
                        icon.style.color = "Grey";
                        icon.classList.remove("fa-blink");
                    }
                }
                
                updateLedStatus(1, data.ledMode1, data.AVled1);  	// LED - STATUS
                updateLedStatus(2, data.ledMode2, data.AVled2);
                
                lastStatus[1] = data.SPled1;                        			// Uložení hodnot pro pozdější použití v modálu
                lastStatus[2] = data.SPled2;
                
                updateSliderUI(1, data.SPled1);                     			// funkce pro update slideru
                updateSliderUI(2, data.SPled2);
                
                if (data.statusPH !== undefined) {                  			// BARVY pro auto/rucne zav/rucne-vyp
                    const val = parseInt(data.statusPH);
                    lastStatus.phMode = val; // Uložíme pro potřeby modálu
                    
                    const badge = document.getElementById("statusPH");
                    if (badge) {
                        badge.classList.remove('status-vyp', 'status-man', 'status-auto'); // reset tříd
                        const classes = ['status-vyp', 'status-man', 'status-auto', 'status-auto'];
                        const texts = ['VYP', 'ZAP', 'A-VYP', 'A-ZAP'];
                        
                        badge.innerText = texts[val] || '--';
                        if (classes[val]) badge.classList.add(classes[val]);
                        
                        if (val === 3) {
                            badge.style.backgroundColor = "#2ecc71"; 	// Zelená - automat ON
                        } else if (val === 2) {
                            badge.style.backgroundColor = "#3498db"; 	// Modrá - automat OFF
                        } else {
                            badge.style.backgroundColor = "";        			// podle CSS 
                        }
                    }
                    
                    
                    updatePhModalButtons(val);			// Aktualizace tlačítek v modálu (pokud je otevřený)
                }
                
                // DYNAMICKÁ AKTUALIZACE MODÁLU PRO SNIMACE
                const modal = document.getElementById("sensorModal");
                // Kontrola: Je modál na stránce a je zobrazený?
                if (modal && modal.style.display === "block") {
                    const liveKey = modal.getAttribute("data-live-key");
    
                    if (liveKey && data[liveKey] !== undefined) {
                        // Dynamicky použijeme klíč pro přístup k datům: data["tempWater"]
                        // Pokud je to vlhkost (humCover), dáme 0 des. míst, jinak 1.
                        let decimals = (liveKey.includes("hum")) ? 0 : 1;
                        
                        updateElement("m-act", data[liveKey], decimals, 1);
                    }
                }
                
            } catch (e) {
                console.error("Chyba při parsování JSON:", e);
            }
        }
    };
    xhttp.open("GET", "/updateAll", true);
    xhttp.send();
}
//=====================================
// FUNKCE UPDATE HODNOTY
//=====================================
function updateElement(id, value, decimals = 0, divider = 1) {
    var el = document.getElementById(id);
    if (el) {
        let displayValue;
        if (!isNaN(value) && value !== "" && value !== null) {
            let num = Number(value) / divider;
            displayValue = num.toFixed(decimals);
        } else {
            displayValue = value;
        }

        // OPRAVA: Rozlišení mezi běžným prvkem a vstupním polem
        if (el.tagName === "INPUT") {
            el.value = displayValue;
        } else {
            el.innerText = displayValue;
        }
    }
}

//=====================================
// UPDATE SLIDER
//=====================================
function updateSliderUI(num, val) {
    if (isUserDragging) return; // Pokud uživatel zrovna hýbe sliderem, nebudeme mu ho měnit
    // 1. Aktualizace prvků na hlavní stránce (pokud tam nějaké jsou)
    const dashboardVal = document.getElementById(`valLed${num}`);
    if (dashboardVal) dashboardVal.innerText = val;

    // 2. Aktualizace v modálním okně
    const modal = document.getElementById("controlModal");
    const modalSlider = document.getElementById("controlSlider");
    
    // PREVENCE CHYBY: Pokud slider nebo modál neexistuje, funkci ukončíme
    if (!modal || !modalSlider) return;
    
    // Zkontrolujeme: Je modál otevřený? A je otevřený pro tuto konkrétní LED?
    if (modal.style.display === "block" && modalSlider.getAttribute("data-led-num") == num) {
        modalSlider.value = val;
        const valDisplay = document.getElementById("valDisplay");
        if (valDisplay) valDisplay.innerText = val;
    }
}
// Funkce, kterou volá slider při pohybu
function handleSliderInput(val) {
    const slider = document.getElementById("controlSlider");
    const num = slider.getAttribute("data-led-num"); // Zjistíme, které LED ovládáme
    
    document.getElementById("valDisplay").innerText = val;
    
    // Odeslání do ESP32
    fetch(`/setLedVal?num=${num}&val=${val}`)
        .catch(err => console.error("Chyba komunikace:", err));
}

//==============================================================================
// Modál Scheduler, chartModal a sensorModal pro obrazovky se snímači
//==============================================================================
function createModals() {
    const placeholder = document.getElementById('modals-placeholder');
    if (!placeholder) return; // Pokud prvek neexistuje, ukonči funkci a nepokračuj
    
    const modalsHTML = `
    <div id="chartModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="chartModalHeader">
                    <i class="fas fa-chart-area"></i>&nbsp;<span id="chartModalTitle">Historie</span>
                </h3>
                <div class="modal-controls">
                    <button onclick="changeChartInterval()" class="btn-modal">
                        <i class="fas fa-clock"></i> <span id="timeRangeLabel"> 1H </span>
                    </button>
                    <button onclick="closeModal('chartModal')" class="btn-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="temp_chart_div" style="width: 100%; height: 350px;"></div>
        </div>
    </div>
    <div id="sensorModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="sensorTitle">
                    <i class="fas fa-cog"></i> NASTAVENÍ
                </h3>
                <div class="modal-controls">
                    <button onclick="closeModal('sensorModal')" class="btn-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="status-row-modal" style="margin: 15px 0 20px 0;">
                <span id="m-almSen" class="badge-mini">SENSOR</span>
                <span id="m-almMin" class="badge-mini">LO LIM</span>
                <span id="m-almMax" class="badge-mini">HI LIM</span>
            </div>
            <div class="activity-grid">
                <div class="control-group" id="group-inst">
                    <label class="check-container"><input type="checkbox" id="m-inst"> INSTAL</label>
                </div>
                <div class="control-group" id="group-enAlm">
                    <label class="check-container"><input type="checkbox" id="m-enAlm"> ALARM</label>
                </div>
            </div>
            <div class="activity-grid" style="margin-top: 15px;">
                <div class="control-group" id="group-act">
                    <label>AV</label>
                    <input type="number" id="m-act" class="modal-input" readonly style="background: #222; color: var(--accent); border-color: #444; font-weight: bold;">
                </div>
                <div class="control-group" id="group-req">
                    <label>SP</label>
                    <input type="number" id="m-req" class="modal-input">
                </div>
                <div class="control-group" id="group-cal">
                    <label>CAL</label>
                    <input type="number" id="m-cal" class="modal-input">
                </div>
                <div class="control-group" id="group-hys">
                    <label>HYS</label>
                    <input type="number" id="m-hys" class="modal-input">
                </div>
                <div class="control-group" id="group-min">
                    <label>LO LIM</label>
                    <input type="number" id="m-min" class="modal-input">
                </div>
                <div class="control-group" id="group-max">
                    <label>HI LIM</label>
                    <input type="number" id="m-max" class="modal-input">
                </div>
            </div>
            <button class="btn-save" style="margin-top: 20px;" onclick="saveSensorSettings()">
                <i class="fas fa-save"></i> ULOŽIT NASTAVENÍ
            </button>
        </div>
    </div>
    <div id="schedulerModal" class="modal">
        <div class="modal-content modal-wide">
            <div class="modal-header">
                <h3 id="schedulerModalHeader">
                    <i class="fas fa-calendar-alt"></i>&nbsp;<span id="schedulerTitle">Plánovač</span>
                </h3>
                <div class="modal-controls">
                    <button onclick="closeModal('schedulerModal')" class="btn-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div class="modal-table-wrapper">
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th><i class="fas fa-hourglass-start" title="Čas"></i> Čas (hh:mm)</th>
                            <th id="thVykon"><i class="fas fa-sun" title="Výkon %"></i> Výkon (%)</th>
                            <th id="thRampa"><i class="fas fa-history" title="Rampa (s)"></i> Rampa (s)</th>
                        </tr>
                    </thead>
                    <tbody id="scheduleBody"></tbody>
                </table>
            </div>

            <button id="saveBtn" class="btn-save" style="margin-top: 15px;">
                <i class="fas fa-save"></i> ULOŽIT NASTAVENÍ
            </button>
        </div>
    </div>`;

    placeholder.innerHTML = modalsHTML;
}

//==============================================================================
// 1. Hlavní funkce pro otevření modálu - GRAF
//==============================================================================
function openChart(id) {
    const config = sensorConfig[id];
    if (!config) {
        console.error("Konfigurace pro senzor ID " + id + " nebyla nalezena.");
        return;
    }
    currentChartType = config.id;                   // Uloží se typ pro funkci přepínání času
    currentChartColor = config.color || "#2ecc71";  // Pokud se barva nezadá, použije se zelená
    // console.info("Konfigurace pro senzor ID " + id);
    const titleEl = document.getElementById('chartModalTitle');
    if (titleEl) {
        titleEl.innerText = `${config.name} [${config.unit}]`;  
    }
    document.getElementById('chartModal').style.display = 'block';
    
    // Resetujeme label tlačítka na výchozí (nebo můžeme nechat na aktuálním GraphX)
    refreshChart();
}

// 2. Funkce pro změnu intervalu (volá ESP32)
function changeChartInterval() {
    fetch('/changeTimeChart') //api/
        .then(response => response.json())
        .then(data => {
            // graphX (0, 1, 2, 3) poslaná z ESP32
            const gx = parseInt(data.graphX);
            const labels = [" 1H", " 24H", " 7D", " 30D"];
            const labelEl = document.getElementById('timeRangeLabel');
            if (labelEl) {
                labelEl.innerText = labels[gx] || " --";
            }
            refreshChart(); // Znovu vykreslíme graf s novými daty
        })
        .catch(err => console.error("Chyba při změně času:", err));
}
//=====================================
// CHART - Samotné vykreslení (vaše upravená funkce)
//=====================================
function refreshChart() {
    if (!currentChartType) {
        //console.warn("Není vybrán žádný senzor pro zobrazení grafu.");
        return; 
    }
    if (typeof google === 'undefined' || !google.visualization) { //|| !google.visualization.DataTable
        //setTimeout(refreshChart, 200);
        //console.warn("Google Charts se stále načítá nebo není k dispozici");
        //setTimeout(refreshChart, 3000);
        return;
    }

    const type = currentChartType;
    const elementId = "temp_chart_div";
    const chartDiv = document.getElementById(elementId);
    if (!chartDiv) return; // Pokud na stránce není div pro graf, taky končíme
    

    fetch('/chart?type=' + type) // /api
        .then(response => response.json())
        .then(json => {
            const dataTable = new google.visualization.DataTable();
            
            // 1. Sloupec: Čas (X)
            dataTable.addColumn('number', 'Vzorek');
            
            // 2. Sloupec: Aktuální hodnota (Y1)
            dataTable.addColumn('number', json.type);

            // Dynamické sloupce podle enSP, enMIN, enMAX
            if (json.enSET) dataTable.addColumn('number', 'SP');
            if (json.enMIN) dataTable.addColumn('number', 'LO LIM');
            if (json.enMAX) dataTable.addColumn('number', 'HI LIM');

            // Příprava dat pro Google Charts
            const rows = [];
            for (let i = 0; i < json.numValues; i++) {
                let val = json.data[i];
                let row = [i, val]; // Základ: Index vzorku a hodnota

                // Přidáme konstantní čáry limitů ke každému bodu
                if (json.enSET) row.push(json.setVal);
                if (json.enMIN) row.push(json.minVal);
                if (json.enMAX) row.push(json.maxVal);
                
                rows.push(row);
            }

            dataTable.addRows(rows);

            // Nastavení titulků osy X podle GraphX
            let xAxisTitle = "Čas";
            switch(json.GraphX) {
                case 0: xAxisTitle = "Poslední hodina (minuty)"; break;
                case 1: xAxisTitle = "Posledních 24 hodin"; break;
                case 2: xAxisTitle = "Posledních 7 dní"; break;
                case 3: xAxisTitle = "Posledních 30 dní"; break;
            }
            
            let hAxisOptions = { 
                title: xAxisTitle,
                gridlines: { color: '#333' },
                textStyle: { color: '#888' }    // Barva čísel na vodorovné ose 
            };
            
            // Osa X - dělení podle časového intervalu
            if (json.GraphX === 3) { // 30 dní, 180 x 4h, značka každý 5 den
                hAxisOptions.ticks = [
                    {v: 0, f: '0'}, {v: 30, f: '5'}, {v: 60, f: '10'}, 
                    {v: 90, f: '15'}, {v: 120, f: '20'}, {v: 150, f: '25'}, {v: 180, f: '30'}
                ];
            } else if (json.GraphX === 2) { // 7 dní = 168 x 1 hod, značka každý den 
                hAxisOptions.ticks = [
                    {v: 0, f: '0'}, {v: 24, f: '1'}, {v: 48, f: '2'}, {v: 72, f: '3'},
                    {v: 96, f: '4'}, {v: 120, f: '5'}, {v: 144, f: '6'}, {v: 168, f: '7'}
                ];
            } else if (json.GraphX === 1) { // 24 hodin = 144 x 10 min, značka každé 4h
                hAxisOptions.ticks = [
                    {v: 0, f: '0'}, {v: 24, f: '4'}, {v: 48, f: '8'},  {v: 72, f: '12'},
                    {v: 96, f: '16'}, {v: 120, f: '20'}, {v: 144, f: '24'}
                ];
            }
            // U GraphX === 0 (1 hodina) to klidně necháme na automatice.

            const options = {
                title: `${json.type} Poslední vzorek ${json.lastH}:${json.lastM < 10 ? '0'+json.lastM : json.lastM}`,
                titleTextStyle: { 
                    color: '#eeeeee',   // Barva hlavního titulku grafu
                    //fontSize: 14,       // velikost
                    bold: true 
                },
                backgroundColor: 'transparent',
                chartArea: { width: '85%', height: '70%' },
                curveType: 'function',
                // Barvy: 1. data, 2. SP, 3. Min, 4. Max
                colors: [currentChartColor, '#f1c40f', '#e74c3c', '#e74c3c'],
                hAxis: hAxisOptions,

                vAxis: { 
                    gridlines: { color: '#333' },   // Barva čísel na svislé ose
                    textStyle: { color: '#888' }    // Barva pomocných linek v pozadí
                },
                legend: { 
                    position: 'bottom', 
                    textStyle: { color: '#eee' }    // Barva legendy dole
                },
                series: {
                    // Čáry limitů budou tenčí a přerušované
                    1: { lineDashStyle: [4, 4], lineWidth: 2 },
                    2: { lineDashStyle: [2, 2], lineWidth: 2 },
                    3: { lineDashStyle: [2, 2], lineWidth: 2 }
                }
            };

            const chart = new google.visualization.LineChart(document.getElementById(elementId));
            chart.draw(dataTable, options);
        })
        .catch(err => {
            console.error("Chyba JSON dat:", err);
            document.getElementById(elementId).innerHTML = "Chyba načítání dat z ESP32.";
        });
}

//==============================================================================
// SNIMAC - otevření modálu a načtení JSON dat
//==============================================================================
function openSensorSettings(id, dataKey, visibleFields) {
    const modal = document.getElementById("sensorModal");
    const title = document.getElementById("sensorTitle");
    
    if (!modal) return;
    
    // Vytáhneme si data z globální konfigurace
    const config = sensorConfig[id] || { name: "Neznámý", unit: ""};
    
    // 1. Nastavení nadpisu modálu
    if (title) {
        title.innerHTML = `<i class="fas fa-cog"></i>&nbsp; ${config.name}&nbsp;[${config.unit}]`;
    }
    const unitLabels = document.querySelectorAll('.modal-unit-label');
    unitLabels.forEach(label => {
        label.innerText = config.unit;
    });
    
    // 2. Uložení ID a klíče pro živá data (refreshAllData)
    modal.setAttribute("data-current-id", id);
    modal.setAttribute("data-live-key", dataKey);

    // 3. LOGIKA SKRÝVÁNÍ POLÍ - definujeme všechna pole, která umíme ovládat
    const allPossibleFields = ['inst', 'enAlm', 'req', 'cal', 'hys', 'min', 'max'];
    
    allPossibleFields.forEach(field => {
        // Hledáme kontejner (skupinu), ne jen samotný input
        const group = document.getElementById('group-' + field);
        if (group) {
            if (visibleFields.includes(field)) {
                group.style.display = "block"; // Zobrazit
            } else {
                group.style.display = "none";  // Skrýt
            }
        }
    });

    // 4. Zobrazení modálu
    modal.style.display = "block";

    // 5. Načtení dat z ESP32
    fetch(`/getSensorData?num=${id}`)
        .then(response => response.json())
        .then(data => {
            // Checkboxy
            if(document.getElementById('m-inst')) document.getElementById('m-inst').checked = data.inst;
            if(document.getElementById('m-enAlm')) document.getElementById('m-enAlm').checked = data.enAlm;
            
            // Číselná pole
            const fields = ['req', 'cal', 'hys', 'min', 'max'];
            fields.forEach(f => {
                const el = document.getElementById('m-' + f);
                if(el && data[f] !== undefined) {
                    // Pokud je to vlhkost (ID 1), můžeme dát 0 des. míst, jinak 1
                    let decimals = (id === 1) ? 0 : 1;
                    el.value = data[f].toFixed(decimals);
                }
            });

            // Barvení stavových indikátorů
            updateModalBadge('m-almSen', data.almSen, "SENSOR", "SENSOR");
            updateModalBadge('m-almMin', data.almMin, "LO LIM", "LO LIM");
            updateModalBadge('m-almMax', data.almMax, "HI LIM", "HI LIM");
        })
        .catch(err => console.error("Chyba načítání snímače:", err));
}
//=====================================
// SNIMAC - barvení badge v modálu
//=====================================
function updateModalBadge(id, isAlarm, textOK, errorText) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isAlarm) {
        el.style.backgroundColor = "var(--danger)";
        el.innerText = errorText;
    } else {
        el.style.backgroundColor = "#444";
        el.innerText = textOK;
    }
}
//=====================================
// SNIMAC - uloz nastaveni
//=====================================
function saveSensorSettings() {
    const modal = document.getElementById("sensorModal");
    const id = modal ? modal.getAttribute("data-current-id") : 0;
    // Pomocná funkce pro převod textu na "ESP formát" (x10)
    /*const toEspFormat = (id) => {
        const val = document.getElementById(id).value;
        return Math.round(parseFloat(val));
    };*/
    const sensorData = {
        id: id,
        inst: document.getElementById('m-inst').checked ? 1 : 0,
        enAlm: document.getElementById('m-enAlm').checked ? 1 : 0,
        req: document.getElementById('m-req').value,
        cal: document.getElementById('m-cal').value,
        hys: document.getElementById('m-hys').value,
        min: document.getElementById('m-min').value,
        max: document.getElementById('m-max').value
    };

    const query = new URLSearchParams(sensorData).toString();
    fetch(`/updateSensor?${query}`)
        .then(response => {
            if (response.ok) {
                alert("Nastavení uloženo");
                closeModal('sensorModal');
                refreshAllData();
            }
        });
 
}

//==============================================================================
// OKNO PRO OVLÁDÁNÍ LED
//==============================================================================
// Otevření modálu pro ovládání LED
function openControlModal(num, label) {
    const modal = document.getElementById("controlModal");
    const slider = document.getElementById("controlSlider");
    const titleSpan = document.getElementById("controlTitle"); // Cílíme na span uvnitř H3

    if (modal && slider) {
        modal.style.display = "block";
        
        // Změníme jen text, ikona v <h3> zůstane netknutá
        if (titleSpan) titleSpan.innerText = label;
        
        // Nastavíme slideru informaci, kterou LED zrovna ovládá
        slider.setAttribute("data-led-num", num);
        
        // Nastavíme slider a číslo na hodnotu z paměti
        const currentVal = lastStatus[num] || 0;
        slider.value = currentVal;
        document.getElementById("valDisplay").innerText = currentVal;
    }
}
//=====================================
// Aktualizace stavu LED (badge na kartě + tlačítka v modálu)
//=====================================
function updateLedStatus(num, mode, power) {
    const badge = document.getElementById(`statusLed${num}`);
    if (!badge) return;

    // 1. Vyčištění starých stylů
    badge.classList.remove('status-vyp', 'status-man', 'status-auto');
    badge.style.backgroundColor = ""; 

    let text = "--";
    let className = "";
    let bgColor = "";

    // 2. Logika pro určení stavu
    if (mode == 0) {
        text = "VYP";
        className = "status-vyp";
    } else if (mode == 1) {
        text = "RUČNĚ";
        className = "status-man";
    } else if (mode == 2) {
        // Režim AUTOMAT - rozhodujeme podle výkonu (power)
        className = "status-auto";
        if (Number(power) > 0) {
            text = "A-ZAP";
            bgColor = "#2ecc71"; // Zelená (stejná jako u PH)
        } else {
            text = "A-VYP";
            bgColor = "#3498db"; // Modrá (stejná jako u PH)
        }
    }

    // 3. Aplikace textu a barev na badge
    badge.innerText = text;
    if (className) badge.classList.add(className);
    if (bgColor) badge.style.backgroundColor = bgColor;

    // 4. Update tlačítek v MODÁLU (pokud je otevřený pro tuto LED)
    const modal = document.getElementById("controlModal");
    const slider = document.getElementById("controlSlider");
    
    if (modal && modal.style.display === "block" && slider) {
        const currentOpenedLed = slider.getAttribute("data-led-num");
        if (currentOpenedLed == num) {
            // Reset aktivních tříd na tlačítkách v modálu
            document.querySelectorAll('#controlModal .mode-btn').forEach(btn => {
                btn.classList.remove('active-vyp', 'active-man', 'active-auto');
            });
            
            // Aktivace správného tlačítka (v modálu jsou jen 0, 1, 2)
            const activeBtn = document.getElementById(`btnMode${mode}`);
            if (activeBtn) {
                const activeClasses = ['active-vyp', 'active-man', 'active-auto'];
                activeBtn.classList.add(activeClasses[mode]);
            }
        }
    }
}
//=====================================
// Funkce, která se zavolá po dokončení pohybu slideru (puštění tlačítka/prstu)
//=====================================
function handleSliderChange(val) {
    const slider = document.getElementById("controlSlider");
    const num = slider.getAttribute("data-led-num"); // Zjistíme, kterou LED ovládáme

    console.log(`Posílám novou hodnotu pro LED ${num}: ${val}%`);

    // Odešleme požadavek na ESP32 (předpokládáme endpoint /setLed)
    fetch(`/setLed?num=${num}&val=${val}`)
        .then(response => {
            if (response.ok) {
                // Hned po uložení aktualizujeme data, aby se potvrdil stav
                refreshAllData();
            }
        })
        .catch(err => console.error("Chyba při ukládání hodnoty slideru:", err));
}
//=====================================
// Funkce pro odeslání režimu do ESP32
//=====================================
function setMode(mode) {
    // Zjistíme, kterou LED právě ovládáme, přímo ze slideru v modálu
    const num = document.getElementById("controlSlider").getAttribute("data-led-num");
    
    // Používáme parametr 'val' (nebo 'mode'), aby to sedělo s tvým kódem v ESP
    fetch(`/setLedMode?num=${num}&mode=${mode}`)
        .then(() => {
            // Ihned po kliknutí můžeme vynutit refresh, aby byla odezva okamžitá
            refreshAllData();
        })
        .catch(err => console.error("Chyba při nastavení režimu:", err));
}

//==============================================================================
// OKNO PRO OVLÁDÁNÍ VENTILU CO2
//==============================================================================
// Otevření modálu pro PH
function openPhControlModal() {
    const modal = document.getElementById("phControlModal");
    if (modal) {
        modal.style.display = "block";
        // Pokud už máme uložený stav v lastStatus (index 3 pro PH), aktualizujeme tlačítka hned
        if (lastStatus.phMode !== undefined) {
            updatePhModalButtons(lastStatus.phMode);
        }
    }
}
//=====================================
// Odeslání režimu do ESP32
//=====================================
function setPhMode(mode) {
    fetch(`/setPhMode?mode=${mode}`)
        .then(() => {
            refreshAllData(); // Refreshne data a tím i barvy tlačítek
        })
        .catch(err => console.error("Chyba při nastavení PH režimu:", err));
}

// Aktualizace tlačítek v modálu (voláno z refreshAllData)
function updatePhModalButtons(val) {
    const modal = document.getElementById("phControlModal");
    if (modal && modal.style.display === "block") {
        // Resetujeme tlačítka (odebereme aktivní třídy)
        document.querySelectorAll('#phControlModal .mode-btn').forEach(btn => {
            btn.classList.remove('active-vyp', 'active-man', 'active-auto');
        });
        let activeBtnId = "";
        let activeClass = "";

        if (val === 0) {
            activeBtnId = "btnPhMode0";
            activeClass = "active-vyp";
        } else if (val === 1) {
            activeBtnId = "btnPhMode1";
            activeClass = "active-man";
        } else if (val === 2 || val === 3) {
            // Oba stavy (2 i 3) aktivují tlačítko AUTO
            activeBtnId = "btnPhMode2";
            activeClass = "active-auto";
        }        
        // Rozsvítíme správné tlačítko
        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.classList.add(activeClass);
        }
    }
}


//==============================================================================        
// OKNO PRO NASTAVENÍ SCHEDULERU PRO LED
//==============================================================================        
function openSchedulerModal(num) {
    const modal = document.getElementById("schedulerModal");
    const titleSpan = document.getElementById("schedulerTitle");
    
    if (titleSpan) {
        titleSpan.innerText = (num === 3) ? "CO2" : `LED ${num}`;
    }
    
    if (modal) {
        modal.style.display = "block";
        loadSchedule(num);          // Funkce pro načtení dat tabulky
    }
}

//=====================================
// SCHEDULER - Načtení dat 
//=====================================
function loadSchedule(num) {
    const body = document.getElementById("scheduleBody");
    body.innerHTML = "<tr><td colspan='4'>Načítám...</td></tr>";
    const isCO2 = (num === 3); // jedna se o CO2
    
    // Dynamická úprava hlavičky tabulky
    const thVykon = document.getElementById("thVykon");
    const thRampa = document.getElementById("thRampa");
    
    if (thVykon) {
        thVykon.innerHTML = isCO2 
            ? '<i class="fas fa-power-off" title="Stav"></i> Stav (0=VYP, 1=ZAP)' 
            : '<i class="fas fa-sun" title="Výkon %"></i> Výkon (%)';
    }
    if (thRampa) {
        thRampa.style.display = isCO2 ? "none" : "table-cell";
    }
    
    fetch(`/getSchedule?num=${num}`)
        .then(response => response.json())
        .then(data => {
            let html = "";
            data.forEach((slot, i) => {
                const hh = String(slot.h).padStart(2, '0');
                const mm = String(slot.m).padStart(2, '0');
                
                html += `
                    <tr>
                        <td style="color: white;">${i + 1}</td>
                        <td>
                            <input type="number" id="h${i}" value="${hh}" min="0" max="23">
                            <span class="time-sep">:</span>
                            <input type="number" id="m${i}" value="${mm}" min="0" max="59">
                        </td>
                        <td>
                            <input type="number" id="p${i}" value="${slot.p}" min="0" max="100">
                        </td>`;
                        // Zpracování sloupce Rampa
                if (isCO2) {
                    // Pro CO2 vygenerujeme jen skryté pole pro uložení hodnoty 0, aby ESP32 dostalo vše, co potřebuje
                    html += `<input type="hidden" id="d${i}" value="0">`;
                } else {
                    // Pro LED zobrazíme klasickou buňku
                    html += `
                        <td>
                            <input type="number" id="d${i}" class="long-input" value="${slot.d}" min="0" max="900">
                        </td>`;
                }
                
                html += `</tr>`;
            });
            body.innerHTML = html;
            // Navázání funkce na tlačítko uložit
            document.getElementById("saveBtn").onclick = () => saveSchedule(num);
        })
        .catch(err => {
            body.innerHTML = "<tr><td colspan='4' style='color:red;'>Chyba načítání</td></tr>";
        });
}
//=====================================
// SCHEDULER - Odeslání dat do ESP32
//=====================================
function saveSchedule(num) {
    const scheduleData = [];
    const rowCount = 10;

    for (let i = 0; i < rowCount; i++) {
        const inputH = document.getElementById(`h${i}`);
        const inputM = document.getElementById(`m${i}`);
        const inputP = document.getElementById(`p${i}`);
        const inputD = document.getElementById(`d${i}`);

        // Kontrola pomocí prohlížeče (využívá ty min/max z HTML)
        // Kontrola platnosti - přeskočíme d${i}, pokud je to hidden (CO2)
        if (!inputH.checkValidity() || !inputM.checkValidity() || !inputP.checkValidity() || 
            (inputD.type !== "hidden" && !inputD.checkValidity())) {
            
            alert(`Chyba na řádku ${i + 1}: Zadané hodnoty jsou mimo povolený rozsah!`);
            return; 
        }

        // Pokud je vše OK, uložíme do pole jako čísla
        scheduleData.push({
            h: parseInt(inputH.value),
            m: parseInt(inputM.value),
            p: parseInt(inputP.value),
            d: parseInt(inputD.value)
        });
    }

    // Odeslání do ESP32 
    fetch(`/saveSchedule?num=${num}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData)
    })
    .then(response => {
        if (response.ok) {
            alert("Plán uložen!");
            closeModal('schedulerModal');
        } else {
            alert("Chyba při komunikaci s ESP32.");
        }
    })
    .catch(err => alert("Chyba: " + err));
}
//==============================================================================
// NASTAVENI - nacteni dat
//==============================================================================
function loadSettingsPage() {
    const tableBody = document.getElementById('configTableBody');
    
    if (!tableBody) return; 		// Pokud nejsme na settings.html, funkce se v klidu ukončí

    console.log("1. Spouštím stahování nastavení z ESP32...");

    fetch('/getSettings')
        .then(response => {
            if (!response.ok) throw new Error("Chyba komunikace se serverem");
            return response.json();
        })
        .then(data => {
            console.log("2. Přijatá data z ESP:", data);

            // Kontrola, zda ESP opravdu poslalo to, co očekáváme
            if (!data || !Array.isArray(data.slots)) {
                console.error("3. Chybný formát dat! Chybí pole 'slots'.");
                tableBody.innerHTML = "<tr><td colspan='4' style='color:red;'>Chyba formátu dat z ESP32</td></tr>";
                return;
            }
                        
            let tableHTML = "";

            for (let i = 0; i < 3; i++) {
                // Pokud z ESP přijde méně dat (třeba chybí 3. slot), použije se výchozí hodnota
                let slot = data.slots[i] || { en: false, from: 0, to: 0 }; 
                console.log("3. Data zkontrolována, začínám generovat HTML...");//style="color: white; font-weight: bold; text-align: left; padding-left: 10px;"
                tableHTML += `
                    <tr>
                        <td>${deviceNames[i] || 'Zařízení'}</td>
                        <td>
                            <label class="check-container" style="display: flex; justify-content: center; margin: 0; min-height: 35px;">
                                <input type="checkbox" id="en_${i}" ${slot.en ? 'checked' : ''}>
                                <span class="checkmark"></span>
                            </label>
                        </td>
                        <td>
                            <input type="number" id="from_${i}" value="${slot.from}" min="0" max="23">
                        </td>
                        <td>
                            <input type="number" id="to_${i}" value="${slot.to}" min="0" max="23">
                        </td>                                           
                </tr>`;
            }
            
            // Vykreslení dat do HTML
            console.log("4. HTML vygenerováno, zkouším ho zapsat do tabulky...");
            tableBody.innerHTML = tableHTML;
            console.log("5. HOTOVO! Tabulka by měla být vidět.");
            
            // Nastavení NTP
            const ntpCb = document.getElementById('ntpEn');
            if (ntpCb) {
                ntpCb.checked = data.ntpEn ? true : false;
                toggleNTP();
                console.log("6. NTP časovač nastaven.");
            }
			// RTC
			const rtcCheckbox = document.getElementById("rtcEn");
			if (rtcCheckbox) {
				rtcCheckbox.checked = data.rtcEn ? true : false;
			}
			// Synchronizace v ??
            if (data.enSyncDT !== undefined) {
                document.getElementById('enSyncDT').checked = data.enSyncDT == 1;
                document.getElementById('syncTime').value = data.syncTime;
                toggleSync(); // Nastaví viditelnost podle hodnoty
            }
            
        })
        .catch(err => {
            console.error("Kritická chyba ve funkci loadSettingsPage:", err);
            tableBody.innerHTML = `<tr><td colspan='4' style='color:red;'>Chyba: ${err.message}</td></tr>`;
        });
}
//=====================================
// NASTAVENI - zobrazení/skrytí ručního zadání času
//=====================================
function toggleNTP() {
    const ntpCb = document.getElementById('ntpEn');
    const manualDiv = document.getElementById('manualTimeDiv');
    
    if (ntpCb && manualDiv) {
        // Pokud je NTP vypnuté (!ntpCb.checked), zobrazíme div (block), jinak ho skryjeme (none)
        manualDiv.style.display = !ntpCb.checked ? 'block' : 'none';
    }
}
//==============================================================================
// NASTAVENI - RTC 
//==============================================================================
function toggleRTC() {
    const rtcCheckbox = document.getElementById('rtcEn');
    if (rtcCheckbox) {
        console.log("RTC modul nastaven na: " + (rtcCheckbox.checked ? "ZAP" : "VYP"));
        // Tady můžeš případně skrýt/zobrazit nějaké prvky, pokud by to bylo potřeba
    }
}
//=====================================
//	NASTAVENI - vyp/zap synchronizaci casu
//=====================================
function toggleSync() {
    const isChecked = document.getElementById('enSyncDT').checked;
    const syncDiv = document.getElementById('syncTimeDiv');
    syncDiv.style.display = isChecked ? 'flex' : 'none';
}

//=====================================
// NASTAVENI - Odeslání dat do ESP32
//=====================================
async function saveSettings() {
    const payload = {
        ntpEn: document.getElementById('ntpEn').checked ? 1 : 0,
		rtcEn: document.getElementById('rtcEn').checked ? 1 : 0,
        enSyncDT: document.getElementById('enSyncDT').checked ? 1 : 0,
        syncTime: parseInt(document.getElementById('syncTime').value) || 0,
        slots: [], 
        manualTime: null
    };

    for (let i = 0; i < 3; i++) {   				 // Posbíráme data ze 3 řádků
        payload.slots.push({
            en: document.getElementById(`en_${i}`).checked ? 1 : 0,
            from: parseInt(document.getElementById(`from_${i}`).value) || 0,
            to: parseInt(document.getElementById(`to_${i}`).value) || 0
        });
    }

    // Pokud je vypnuté NTP, přidáme k odeslání i vybraný ruční čas (unix timestamp)
    if (payload.ntpEn === 0) {
        const timeInput = document.getElementById('manualDateTime').value;
        if (timeInput) {
            // Převedeme HTML čas (např. "2024-05-24T15:30") na Unix timestamp pro ESP32
            payload.manualTime = Math.floor(new Date(timeInput).getTime() / 1000);
        } else {
            alert("Prosím zadejte datum a čas, nebo zapněte NTP.");
            return;
        }
    }

	try {
        // Odeslání do ESP32
        const response = await fetch('/saveSettings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload) 
        });
        
        if (response.ok) {
            alert("Nastavení uloženo!");
        } else {
            alert("Chyba při ukládání: Server vrátil kód " + response.status);
        }
    } catch (err) {
        console.error("Chyba komunikace při ukládání:", err);
        alert("Chyba při ukládání: Nelze se spojit s ESP32.");
    }
}

//=======================================
// ULOZENI - hodnoty grafu
//=====================================
function saveChartValues() {
    // Zobrazíme potvrzení, aby uživatel věděl, že se něco děje
    if (!confirm("Uložit aktuální historii grafů na SD kartu?")) return;

    fetch('/backupGraphs')
    .then(response => {
        if (response.ok) {
            alert("Data grafů byla úspěšně zálohována na SD.");
        } else {
            alert("Chyba: ESP32 data neuložilo.");
        }
    })
    .catch(err => alert("Chyba komunikace: " + err));
}

//==============================================================================
//	FEEDER - Načtení dat a otevření modálu
//==============================================================================
async function openFeederSettings() {
    try {
        const response = await fetch('/getFeedSettings');
        if (!response.ok) throw new Error('Chyba sítě');
        const data = await response.json();
        
        const modalHtml = `
            <div id="feederModal" class="modal" style="display:block;">
                <div class="modal-content" >
                    <div class="modal-header">
                        <h3 id="schedulerModalHeader">
                            <i class="fas fa-calendar-alt"></i>&nbsp;<span id="schedulerTitle">KRMENÍ</span>
                        </h3>
                        <div class="modal-controls">
                            <button onclick="closeFeederModal()" class="btn-modal">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-table-wrapper">
                        <table class="compact-table">
                            <thead>
                                <tr>
                                    <th>DÁVKA Č.</th>
                                    <th><i class="fas fa-power-off"></i> POVOL</th>
                                    <th><i class="fas fa-hourglass-start" title="Čas"></i> Čas (hh:mm)</th>
                                </tr>
                            </thead>
                            <tr>
                                <td><span class="label-text">1</span></td>
                                <td><label class="check-container" style="display: flex; justify-content: center; margin: 0; min-height: 35px;">
                                        <input type="checkbox" id="fE1" ${data.feedE1 ? 'checked' : ''}>
                                        <span class="checkmark"></span>
                                    </label>
                                </td>
                                
                                <td style="display: flex; align-items: center; gap: 5px; justify-content: flex-end;">
                                    <input type="number" id="fH1" class="set-input" min="0" max="23" value="${String(data.feedH1).padStart(2, '0')}"> : 
                                    <input type="number" id="fM1" class="set-input" min="0" max="59" value="${String(data.feedM1).padStart(2, '0')}">
                                </td>
                            </tr>
                            <tr>
                                <td><span class="label-text">2</span></td>
                                <td><label class="check-container" style="display: flex; justify-content: center; margin: 0; min-height: 35px;">
                                        <input type="checkbox" id="fE2" ${data.feedE2 ? 'checked' : ''}>
                                        <span class="checkmark"></span>
                                    </label>
                                </td>
                               
                                <td style="display: flex; align-items: center; gap: 5px; justify-content: flex-end;">
                                    <input type="number" id="fH2" class="set-input" min="0" max="23" value="${String(data.feedH2).padStart(2, '0')}"> : 
                                    <input type="number" id="fM2" class="set-input" min="0" max="59" value="${String(data.feedM2).padStart(2, '0')}">
                                </td>
                            </tr>
                        </table>    
                        <table class="compact-table">
                            <thead>
                                <tr>    
                                    <th colspan="3">NASTAVENÍ</th>
                                </tr>
                            </thead>                            
                            
                            <tr>
                                <td colspan="2"><span class="label-text">CELKEM DÁVEK</span></td>
                                <td style="text-align: left;">
                                    <input type="number" id="fTot" class="set-input" value="${data.feedTot}">
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2"><span class="label-text">SUBDÁVEK</span></td>
                                <td style="text-align: left;">
                                    <input type="number" id="fSub" class="set-input" value="${data.feedSub}">
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2"><span class="label-text">INTERVAL (s)</span></td>
                                <td style="text-align: left;">
                                    <input type="number" id="fInt" class="set-input" value="${data.feedInt}">
                                </td>
                            </tr>
                        </table>
                        <button class="btn-save" style="margin-top: 30px;" onclick="saveFeederSettings()">
                            <i class="fas fa-save"></i> ULOŽIT NASTAVENÍ
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modals-placeholder').innerHTML = modalHtml;

    } catch (error) {
        console.error("Nelze načíst data:", error);
        alert("Chyba při komunikaci s akváriem.");
    }
}
//=======================================
//	FEEDER - ulozeni nastaveni
//=======================================
async function saveFeederSettings() {
    // Příprava dat z formuláře
    const payload = {
        feedE1: document.getElementById('fE1').checked ? 1 : 0,
        feedH1: parseInt(document.getElementById('fH1').value),
        feedM1: parseInt(document.getElementById('fM1').value),
        feedE2: document.getElementById('fE2').checked ? 1 : 0,
        feedH2: parseInt(document.getElementById('fH2').value),
        feedM2: parseInt(document.getElementById('fM2').value),
        feedTot: parseInt(document.getElementById('fTot').value),
        feedSub: parseInt(document.getElementById('fSub').value),
        feedInt: parseInt(document.getElementById('fInt').value)
    };

    try {
        const response = await fetch('/saveFeeder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("Nastavení uloženo");
            closeFeederModal();
        } else {
            alert("Chyba při ukládání (ESP32 odmítlo požadavek).");
        }
    } catch (error) {
        console.error("Chyba sítě při ukládání:", error);
        alert("Nepodařilo se odeslat data. Zkontroluj připojení.");
    }
}
//=====================================
// FEEDER - start, reset
//=====================================
// Pomocná funkce pro jednoduché příkazy (Start, Reset)
function triggerAction(endpoint) {
    fetch(endpoint)
        .then(response => {
            if (response.ok) console.log("Akce " + endpoint + " úspěšná");
        })
        .catch(err => alert("Chyba komunikace: " + err));
}
//=====================================
// FEEDER - ruční ovládání motoru
//=====================================
function openManualMotorModal() {
    // Zde můžeš buď otevřít existující controlModal nebo vytvořit jednoduchý prompt
    const steps = prompt("Zadej počet kroků/otáček pro ruční posuv:", "100");
    if (steps != null) {
        fetch('/feedMotorManual?steps=' + steps);
    }
}
//=====================================
// FEEDER - zavreni modalu
//=====================================
function closeFeederModal() {
    const modal = document.getElementById('feederModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('modals-placeholder').innerHTML = ''; // Vyčistit placeholder
    }
}
//==============================================================================
// DAVK.HNOJIVA - status lahvicek
//==============================================================================
function loadInitialTanks() {
    if (!document.getElementById("fBar1")) return; // Pokud neni stranka s dávkovačem, tak konec

    fetch('/fertStatus')
        .then(response => response.json())
        .then(data => {
            const maxVolume = data.maxV || 450;
			const instFlags = data.inst || 0;
            // Definice barev hladin: modrá, žlutá, zelená, tmavě černá
            const pumpColors = ["#3498db", "#f1c40f", "#178f17", "#d3d3d3"];            
            for (let i = 0; i < 4; i++) {
				const pumpIdx = i + 1;
				const rawValue = data["v" + pumpIdx];
                const currentML = parseFloat(rawValue) || 0;    // Aktuální ml z ESP
                const currentColor = pumpColors[i];
				// --- LOGIKA PRO ZEŠEDNUTÍ (BITOVÁ) ---
                const column = document.getElementById("fCol" + pumpIdx);
                if (column) {
                    if ((instFlags & (1 << i)) !== 0) {			// Bit 0..3: instalovano
                        column.classList.remove("pump-disabled");
                    } else {
                        column.classList.add("pump-disabled");
                    }
                }
                // --- LOGIKA PRO HLADINY ---
                let percent = (maxVolume > 0) ? (currentML / maxVolume) * 100 : 0;
                // Omezení rozsahu 0-100 (kdyby náhodou přeteklo)
                percent = Math.min(100, Math.max(0, percent));
				
                // Aktualizace textu (Zobrazíme % i zbývající ml)
                const percText = document.getElementById("fPerc" + pumpIdx);
                if (percText) {
                    percText.innerText = Math.round(percent) + "% (" + Math.round(currentML) + " ml)";
                    // Černý text by nebyl vidět, proto pro P4 (index 3) použijeme bílou, pro ostatní jejich barvu
                    percText.style.color = (i === 3) ? "#f3f3f3" : currentColor;
                    percText.style.fontWeight = "bold";
                }
                // Aktualizace grafické hladiny
                const bar = document.getElementById("fBar" + pumpIdx);
                if (bar) {
                    bar.style.height = Math.round(percent) + "%";
                    
                    // Pokud je v lahvičce pod 10 %, zbarví se varovně červeně. Jinak bílá.
                    if (percent < 10) {
                        bar.style.backgroundColor = "#ff3333"; 
                    } else {
                        bar.style.backgroundColor = "grey";//currentColor;
                    }

                    // DOPLNĚNÍ OBRYSU LAHVIČKY:
                    // fBar se hýbe uvnitř rodičovského kontejneru (lahve). Obarvíme border tohoto rodiče.
                    if (bar.parentElement) {
                        // P1 až P3 mají obrys své barvy. Černá P4 dostane stříbrošedý obrys (#888), aby byla vidět.
                        bar.parentElement.style.border = "2px solid " + "#888";
                        bar.parentElement.style.borderRadius = "6px"; // Uhlazení rohů lahvičky
                        bar.parentElement.style.transition = "border-color 0.3s ease";
                    }
                }
            }
            console.log("Stav hnojiv načten.");
        })
        .catch(err => console.error("Chyba při načítání ml:", err));
}

// Spuštění funkce po načtení stránky
document.addEventListener('DOMContentLoaded', loadInitialTanks);

//=======================================
// DAVK.HNOJIVA - nastaveni display: flex;
//=======================================
async function openFertSettings() {
    const response = await fetch('/getFertSettings');
    const data = await response.json(); 
    
    let rowsHtml = "";
    // Definice barev hladin: modrá, žlutá, zelená, tmavě černá
    const pumpColors = ["#3498db", "#f1c40f", "#178f17", "#d3d3d3"];
    data.forEach((p, i) => {
        const currentColor = pumpColors[i];
        rowsHtml += `
        <tr>
            <td style="vertical-align: middle; border-bottom: 1px solid #444; text-align: center; width: 40px;">
                <strong style="color: ${currentColor}; font-size: 1.1em; text-shadow: 0 0 5px rgba(0,0,0,0.5);">P${i+1}</strong>
            </td>
            <td colspan="2" style="padding: 10px 40px; border-bottom: none;">
                <div style="display: flex; align-items: center; justify-content: flex-start; gap: 10px; white-space: nowrap;">
                    <div style="display: flex; align-items: center;">
                        <input type="number" id="h${i}" value="${String(p.h).padStart(2, '0')}" class="set-input mini" style="width: 50px; text-align: center;"> 
                        <span style="margin: 0 2px; font-weight: bold;">:</span> 
                        <input type="number" id="m${i}" value="${String(p.m).padStart(2, '0')}" class="set-input mini" style="width: 50px; text-align: center;">
                    </div>
                    
                    <div style="display: flex; align-items: center; margin-left: 50px;">
                        <input type="number" id="v${i}" value="${p.v}" step="0.1" class="set-input" style="width: 50px; text-align: center;">
                        <small style="margin-left: 15px;">ml</small>
                    </div>
                </div>
            </td>
        </tr>
        <tr style="border-bottom: 1px solid #444;">
            <td style="vertical-align: top; padding: 10px 5px;"></td> <td colspan="2" style="padding: 10px 5px; vertical-align: top;">
                <div style="display: flex; align-items: flex-start;">
                    
                    <div style="display: flex; flex-direction: column; align-items: center; width: 30px; margin-right: 25px;">
                        <small style="font-size: 0.7em; color: #888; margin-bottom: 4px; font-weight: bold;">ZAP</small>
                        <label class="check-container" style="margin: 0; padding: 0; width: 20px; height: 20px; display: block; position: relative; cursor: pointer;">
                            <input type="checkbox" class="act-check" id="inst${i}" ${p.inst ? 'checked' : ''}>
                            <span class="checkmark" style="left: 0; top: 0;"></span>
                        </label>
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: nowrap;">
                        ${['Po','Ut','St','Ct','Pa','So','Ne'].map((d, dIdx) => `
                            <div style="display: flex; flex-direction: column; align-items: center; width: 22px;">
                                <small style="font-size: 0.7em; color: #888; margin-bottom: 4px; display: block; text-align: center;">${d}</small>
                                <label class="check-container" style="margin: 0; padding: 0; width: 20px; height: 20px; display: block; position: relative; cursor: pointer;">
                                    <input type="checkbox" class="act-check" id="d${i}_${dIdx}" ${(p.wd & (1 << dIdx)) ? 'checked' : ''}>
                                    <span class="checkmark" style="left: 0; top: 0;"></span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </td>
        </tr>`;
    });

    const modalHtml = `
    <div id="fertModal" class="modal" style="display:block;">
        <div class="modal-content modal-wide">
            <div class="modal-header">
                <h3><i class="fas fa-flask"></i>&nbsp;PLÁN DÁVKOVÁNÍ</h3>
                <div class="modal-controls">
                    <button onclick="closeModal('fertModal')" class="btn-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="modal-table-wrapper">
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th colspan="2" style="text-align: left; padding-left: 60px;">
                                Nastavení (Čas, Dávka, Dny)
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                <button class="btn-save" style="margin-top: 20px;" onclick="saveFertSettings()">
                        <i class="fas fa-save"></i> ULOŽIT NASTAVENÍ
                </button>
            </div>
        </div>
    </div>`;
    document.getElementById('modals-placeholder').innerHTML = modalHtml;
}
//=======================================
// DAVK.HNOJIVA - Reset hladiny láhve na 450ml
//=======================================
function resetFertLevel(pumpIdx) {
    if (confirm(`Opravdu si doplnil láhev čerpadla ${pumpIdx + 1} ?`)) {
        fetch(`/resetFert?p=${pumpIdx}`)
		.then(response => {
			if (response.ok) {
				alert("Hladina nastavena na 100%");
				//refreshAllData(); // Aktualizace vizuálního sloupce
			}
		});
    }
}
//=======================================
//	DAVK.HNOJIVA - Ruční dávka konkrétního množství ml
//=======================================
function manualFertDose(pumpIdx) {
    // Použijeme confirm pro jednoduché Ano/Ne
    if (confirm(`Opravdu chcete spustit jednu dávku z čerpadla ${pumpIdx + 1}?`)) {
        
        fetch(`/fertManual?p=${pumpIdx}`)
            .then(response => {
                if (response.ok) {
                    console.log(`Manuální dávka pro čerpadlo ${pumpIdx + 1} potvrzena a spuštěna.`);
                } else {
                    console.error("ESP32 odmítlo požadavek na dávkování.");
                }
            })
            .catch(err => alert("Chyba komunikace s akváriem: " + err));
    }
}
//=======================================
// DAVK.HNOJIVA - Ulozeni nastaveni Davkovace 
//=======================================
async function saveFertSettings() {
    const payload = [];
    
    for (let i = 0; i < 4; i++) {
		let wd = 0; // Inicializace bytu pro dny (00000000)

        for (let d = 0; d < 7; d++) {
            const dayCheckbox = document.getElementById(`d${i}_${d}`);
            if (dayCheckbox && dayCheckbox.checked) {
                // Pokud je den zaškrtnutý, nastavíme d-tý bit na 1
                wd |= (1 << d);
            }
        }
        
        payload.push({
			inst: document.getElementById(`inst${i}`).checked,
            h: parseInt(document.getElementById(`h${i}`).value),
            m: parseInt(document.getElementById(`m${i}`).value),
            v: parseFloat(document.getElementById(`v${i}`).value),
            wd: wd
        });
    }

    try {
        const response = await fetch('/saveFertSettings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
		if (response.ok) {
            alert("Plán dávkování uložen.");
            closeModal('fertModal');
            // Doporučuji znovu načíst data pro ikonu v hlavičce
            if (typeof loadInitialTanks === "function") loadInitialTanks();
        } else {
            alert("Chyba při ukládání: Server vrátil chybu " + response.status);
        }	
    } catch (err) {
        alert("Chyba při ukládání: " + err);
    }
}
//==============================================================================
// ZAVRENI MODALU
//==============================================================================        
function closeModal(id) {
    document.getElementById(id).style.display = "none";
}


