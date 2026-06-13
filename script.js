// --- 1. PŘIPOJENÍ K MQTT BROKERU (přes zabezpečené WebSockets) ---
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
    console.log('Připojeno k MQTT Brokeru z GitHubu');
    // Přihlásíme se k odběru tématu, kam ESP32 posílá data
    client.subscribe('smart_aqua_cs/data/vystup', (err) => {
        if (!err) {
            console.log('Úspěšně přihlášeno k odběru tématu smart_aqua_cs/data/vystup');
            // Teprve po úspěšném přihlášení si poprvé vyžádáme data
            client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
        } else {
            console.error('Chyba při přihlášení k odběru:', err);
        }
    });
    
    // Hned po připojení si jednou vyžádáme data
    client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
});

// --- 2. PRAVIDELNÁ ŽÁDOST O DATA (Náhrada za původní setInterval) ---
// Každých 5 sekund pošleme do ESP32 žádost o nová data
setInterval(() => {
    if (client.connected) {
        client.publish('smart_aqua_cs/data/pozadavek', 'updateAll');
    }
}, 5000);

// --- 3. PŘÍJEM DAT Z ESP32 ---
client.on('message', (topic, payload) => {
    if (topic === 'smart_aqua_cs/data/vystup') {
        try {
            // Převedeme text na JSON objekt
            const myObj = JSON.parse(payload.toString());
            console.log("Data z ESP32 úspěšně přijata:", myObj);
            
            // --- VAŠE PŮVODNÍ LOGIKA PRO VÝPIS DO STRÁNKY ---
            // Tento blok kódu jsem vzal přesně z vaší původní funkce updateAll()
            document.getElementById("tempCover").innerHTML   = myObj.tempCover;
            document.getElementById("humCover").innerHTML    = myObj.humCover;
            document.getElementById("AVled1").innerHTML      = myObj.AVled1;
            document.getElementById("SPled1").innerHTML      = myObj.SPled1;
            document.getElementById("AVled2").innerHTML      = myObj.AVled2;
            document.getElementById("SPled2").innerHTML      = myObj.SPled2;
            document.getElementById("tempWater").innerHTML   = myObj.tempWater;
            document.getElementById("SPtempWater").innerHTML = myObj.SPtempWater;
            document.getElementById("phWater").innerHTML     = myObj.phWater;
            document.getElementById("SPphWater").innerHTML   = myObj.SPphWater;
            document.getElementById("levelWater").innerHTML  = myObj.levelWater;
            document.getElementById("flowWater").innerHTML   = myObj.flowWater;
            document.getElementById("AVchgs").innerHTML      = myObj.AVchgs;
            document.getElementById("TMchgs").innerHTML      = myObj.TMchgs;
            
            // Zpracování času
            let cas = myObj.ntpTime;
            document.getElementById("ntpTime").innerHTML = cas;
            
            // Zpracování alarmů
            if (myObj.alarmNo > 0) {
                document.getElementById("alarmNo").style.backgroundColor = "red";
                document.getElementById("alarmNo").innerHTML = "ALARM";
            } else {
                document.getElementById("alarmNo").style.backgroundColor = "green";
                document.getElementById("alarmNo").innerHTML = "OK";
            }

        } catch (e) {
            console.error("Chyba při zpracování JSONu:", e);
        }
    }
});
