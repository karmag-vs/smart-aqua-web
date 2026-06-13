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
    console.log("!!! DOŠLA MQTT ZPRÁVA !!! Téma:", topic);
    if (topic === 'smart_aqua_cs/data/vystup') {
        try {
            // OPRAVA: Přejmenováno z myObj na data, aby seděl zbytek kódu
            const data = JSON.parse(payload.toString());
            console.log("Data z ESP32 úspěšně přijata:", data);

            // Nyní už proměnná 'data' existuje a vše poběží hladce
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
            
            let tmVal = Number(data.TMchgs);
            let tmDecimals = (tmVal < 10.0) ? 1 : 0;
            updateElement("TMchanges", data.TMchgs, tmDecimals);
            
            updateElement("ntpTime", data.ntpTime);
            updateElement("alarmNo", data.alarmNo);
            updateElement("dKH", data.dKH, 1);
            updateElement("co2W", data.co2W);

        } catch (e) {
            console.error("Chyba při zpracování JSONu:", e);
        }
    }
});

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
        
        if (el.tagName === "INPUT") {
            el.value = displayValue;
        } else {
            el.innerText = displayValue;
        }
    }
}
