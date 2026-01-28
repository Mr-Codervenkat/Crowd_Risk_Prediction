const API_URL = window.location.origin;


let barChart = null;
let lineChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initForm();
    initHistory();
    updateDashboardStats();
});

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.page;

            navLinks.forEach(l => l.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(`${targetPage}-page`).classList.add('active');

            if (targetPage === 'history') {
                loadHistory();
            }
        });
    });
}

function initForm() {
    const form = document.getElementById('prediction-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generatePrediction();
    });
}

function initHistory() {
    const clearBtn = document.getElementById('clear-history');

    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all prediction history?')) {
            await fetch(`${API_URL}/clear`, { method: 'DELETE' });
            loadHistory();
            updateDashboardStats();
            showNotification('History cleared successfully', 'success');
        }
    });
}


async function generatePrediction() {
    const submitBtn = document.getElementById('submit-btn');
    const loadingState = document.getElementById('loading-state');
    const resultsSection = document.getElementById('results');

    const formData = {
        eventName: document.getElementById('eventName').value,
        location: document.getElementById('location').value,
        crowdCount: document.getElementById('crowdCount').value,
        eventType: document.getElementById('eventType').value,
        timeSlot: document.getElementById('timeSlot').value
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0;"></div> Processing...';
    loadingState.style.display = 'block';
    resultsSection.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error('Failed to generate prediction');
        }

        const prediction = await response.json();

        displayPrediction(prediction);
        loadHistory();
        updateDashboardStats();


        setTimeout(() => {
            loadingState.style.display = 'none';
            resultsSection.style.display = 'block';
        }, 1000);

    } catch (error) {
        console.error('Prediction error:', error);
        showNotification('Failed to generate prediction. Make sure the backend server is running.', 'error');
        loadingState.style.display = 'none';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
            </svg>
            Generate AI Prediction
        `;
    }
}

function displayPrediction(prediction) {
    const alertBox = document.getElementById('alert-box');
    const densityValue = document.getElementById('density-value');
    const riskValue = document.getElementById('risk-value');
    const recommendationText = document.getElementById('recommendation-text');

    densityValue.textContent = prediction.density;
    riskValue.textContent = prediction.risk;
    recommendationText.textContent = prediction.recommendation;

    alertBox.className = 'alert-box';
    if (prediction.risk === 'Safe') {
        alertBox.classList.add('safe');
    } else if (prediction.risk === 'Warning') {
        alertBox.classList.add('warning');
    } else if (prediction.risk === 'Dangerous') {
        alertBox.classList.add('dangerous');
    }

    createBarChart(prediction);
    createLineChart(prediction);
}

function createBarChart(prediction) {
    const ctx = document.getElementById('barChart');

    if (barChart) {
        barChart.destroy();
    }

    const colors = {
        'Low': '#10b981',
        'Medium': '#f59e0b',
        'High': '#ef4444'
    };

    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Crowd Density Level'],
            datasets: [{
                label: 'Current Level',
                data: [prediction.crowdCount],
                backgroundColor: colors[prediction.density],
                borderColor: colors[prediction.density],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `Count: ${context.parsed.y} people`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of People'
                    }
                }
            }
        }
    });
}

function createLineChart(prediction) {
    const ctx = document.getElementById('lineChart');

    if (lineChart) {
        lineChart.destroy();
    }

    lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: prediction.chartData.labels,
            datasets: [{
                label: 'Predicted Crowd Movement',
                data: prediction.chartData.data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `Expected: ${context.parsed.y} people`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of People'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            }
        }
    });
}

// function savePredictionToHistory(prediction) {
//     let history = JSON.parse(localStorage.getItem('predictionHistory') || '[]');
//     history.unshift(prediction);
//     if (history.length > 50) {
//         history = history.slice(0, 50);
//     }
//     localStorage.setItem('predictionHistory', JSON.stringify(history));
// }

async function loadHistory() {
    const tbody = document.getElementById('history-tbody');

    try {
        const response = await fetch(`${API_URL}/predictions`);
        const history = await response.json();

        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No predictions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = history.map(pred => `
            <tr>
                <td>${new Date(pred.timestamp).toLocaleString()}</td>
                <td>${pred.eventName}</td>
                <td>${pred.location}</td>
                <td>${pred.crowdCount}</td>
                <td>${pred.eventType}</td>
                <td>${pred.timeSlot}</td>
                <td><span class="density-badge density-${pred.density.toLowerCase()}">${pred.density}</span></td>
                <td><span class="risk-badge risk-${pred.risk.toLowerCase()}">${pred.risk}</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Error loading history:", error);
    }
}

async function updateDashboardStats() {
    try {
        const res = await fetch(`${API_URL}/dashboard-stats`);
        const data = await res.json();

        document.getElementById('total-predictions').textContent = data.total_predictions;
        document.getElementById('safe-count').textContent = data.safe;
        document.getElementById('warning-count').textContent = data.warning;
        document.getElementById('dangerous-count').textContent = data.dangerous;

        // AI Accuracy Calculation
        let accuracy = 0;
        if (data.total_predictions > 0) {
            accuracy = Math.round((data.safe / data.total_predictions) * 100);
        }
        document.getElementById('ai-accuracy').textContent = accuracy + "%";

    } catch (err) {
        console.error("Dashboard stats error:", err);
    }
}




function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'error' ? '#ef4444' : '#10b981'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);


async function predictFromImage() {
    const fileInput = document.getElementById("crowdImage");

    if (!fileInput.files[0]) {
        showNotification("Please select an image first!", "error");
        return;
    }

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);

    // Show loading UI like manual prediction
    const loadingState = document.getElementById('loading-state');
    const resultsSection = document.getElementById('results');

    loadingState.style.display = 'block';
    resultsSection.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/predict-image`, {
            method: "POST",
            body: formData
        });

        const prediction = await response.json();

        console.log("Image Prediction:", prediction);

        if (prediction.error) {
            showNotification(prediction.error, "error");
            loadingState.style.display = 'none';
            return;
        }

        // 🔥 SAME UI update as manual prediction
        displayPrediction(prediction);
        loadHistory();
        updateDashboardStats();

        setTimeout(() => {
            loadingState.style.display = 'none';
            resultsSection.style.display = 'block';
        }, 800);

        showNotification("Image prediction completed!", "success");

    } catch (error) {
        console.error("Image prediction error:", error);
        showNotification("Image prediction failed!", "error");
        loadingState.style.display = 'none';
    }
}

function previewImage(event) {
    const file = event.target.files[0];
    const previewBox = document.getElementById("imagePreviewBox");
    const previewImg = document.getElementById("imagePreview");

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewBox.style.display = "block";
        };
        reader.readAsDataURL(file);
    } else {
        previewBox.style.display = "none";
    }
}
