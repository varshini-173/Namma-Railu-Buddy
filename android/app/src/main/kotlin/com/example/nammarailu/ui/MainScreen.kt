package com.example.nammarailu.ui

import android.annotation.SuppressLint
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.nammarailu.MainActivity
import com.example.nammarailu.data.*
import com.google.android.gms.location.LocationServices
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.*
import com.google.maps.android.compose.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import java.util.*
import kotlin.math.*

@SuppressLint("MissingPermission")
@Composable
fun MainScreen() {
    var activeTab by remember { mutableStateOf("Live") }
    var selectedStation by remember { mutableStateOf(STATIONS[0]) }
    var selectedTrain by remember { mutableStateOf(TRAINS[0]) }
    var trainSearch by remember { mutableStateOf("") }
    var isSearching by remember { mutableStateOf(false) }
    val user = FirebaseAuth.getInstance().currentUser
    val context = LocalContext.current
    
    val pings = remember { mutableStateListOf<PlatformPing>() }
    val platformSuggestions = remember { mutableStateListOf<String>() }
    val delays = remember { mutableStateListOf<DelayReport>() }
    val availability = remember { mutableStateListOf<CoachAvailability>() }
    val userPings = remember { mutableStateListOf<PlatformPing>() }
    val userDelays = remember { mutableStateListOf<DelayReport>() }
    val userAvailability = remember { mutableStateListOf<CoachAvailability>() }
    var trainLocation by remember { mutableStateOf<Station?>(null) }
    var showDelayDialog by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }

    // User History listener
    LaunchedEffect(user) {
        if (user == null) return@LaunchedEffect
        val db = FirebaseFirestore.getInstance()
        
        db.collection("pings")
            .whereEqualTo("reportedBy", user.uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null) {
                    userPings.clear()
                    snapshot.documents.forEach { doc ->
                        doc.toObject(PlatformPing::class.java)?.let { userPings.add(it) }
                    }
                }
            }

        db.collection("delays")
            .whereEqualTo("reportedBy", user.uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null) {
                    userDelays.clear()
                    snapshot.documents.forEach { doc ->
                        doc.toObject(DelayReport::class.java)?.let { userDelays.add(it) }
                    }
                }
            }

        db.collection("availability")
            .whereEqualTo("reportedBy", user.uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null) {
                    userAvailability.clear()
                    snapshot.documents.forEach { doc ->
                        doc.toObject(CoachAvailability::class.java)?.let { userAvailability.add(it) }
                    }
                }
            }
    }

    // Location & Alarm
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var destinationStation by remember { mutableStateOf<Station?>(null) }
    var alarmActive by remember { mutableStateOf(false) }
    var distanceToDest by remember { mutableStateOf<Double?>(null) }
    var isOnTrain by remember { mutableStateOf(false) }

    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    LaunchedEffect(Unit) {
        while (true) {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    currentLocation = loc.latitude to loc.longitude
                }
            }
            delay(10000)
        }
    }

    LaunchedEffect(currentLocation, destinationStation, alarmActive, selectedTrain) {
        if (alarmActive && currentLocation != null && destinationStation != null) {
            val dist = calculateDistance(
                currentLocation!!.first, currentLocation!!.second,
                destinationStation!!.latitude, destinationStation!!.longitude
            )
            distanceToDest = dist

            val isNearRoute = selectedTrain.route.any { stationId ->
                STATIONS.find { it.id == stationId }?.let { station ->
                    calculateDistance(currentLocation!!.first, currentLocation!!.second, station.latitude, station.longitude) < 5.0
                } ?: false
            }
            isOnTrain = isNearRoute

            if (dist <= 5.0) {
                (context as? MainActivity)?.triggerVibration()
            }
        } else {
            distanceToDest = null
            isOnTrain = false
        }
    }

    // Firestore listener for Pings
    LaunchedEffect(selectedStation, selectedTrain) {
        val db = FirebaseFirestore.getInstance()
        val now = Timestamp.now()
        
        val registration = db.collection("pings")
            .whereEqualTo("stationId", selectedStation.id)
            .whereEqualTo("trainId", selectedTrain.number)
            .whereGreaterThan("expiresAt", now)
            .orderBy("expiresAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, e ->
                if (e != null) return@addSnapshotListener
                if (snapshot != null) {
                    pings.clear()
                    snapshot.documents.forEach { doc ->
                        val ping = doc.toObject(PlatformPing::class.java)?.copy(id = doc.id)
                        if (ping != null) pings.add(ping)
                    }
                }
            }
    }

    // Platform Suggestions
    LaunchedEffect(selectedStation, selectedTrain) {
        val db = FirebaseFirestore.getInstance()
        val registration = db.collection("pings")
            .whereEqualTo("stationId", selectedStation.id)
            .whereEqualTo("trainId", selectedTrain.number)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(20)
            .addSnapshotListener { snapshot, e ->
                if (e != null) return@addSnapshotListener
                if (snapshot != null) {
                    val suggested = snapshot.documents
                        .mapNotNull { it.toObject(PlatformPing::class.java) }
                        .filter { it.confirmedBy.isNotEmpty() }
                        .map { it.platform }
                        .distinct()
                        .take(3)
                    platformSuggestions.clear()
                    platformSuggestions.addAll(suggested)
                }
            }
    }

    // Tracking listener
    LaunchedEffect(selectedTrain) {
        val db = FirebaseFirestore.getInstance()
        val oneHourAgo = Calendar.getInstance().apply { add(Calendar.HOUR, -1) }.time
        val timestamp = Timestamp(oneHourAgo)

        db.collection("pings")
            .whereEqualTo("trainId", selectedTrain.number)
            .whereGreaterThan("createdAt", timestamp)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(1)
            .addSnapshotListener { snapshot, e ->
                if (e != null) return@addSnapshotListener
                if (snapshot != null && !snapshot.isEmpty) {
                    val latestPing = snapshot.documents[0].toObject(PlatformPing::class.java)
                    trainLocation = STATIONS.find { it.id == latestPing?.stationId }
                } else {
                    trainLocation = null
                }
            }
    }

    // Delay listener
    LaunchedEffect(selectedTrain) {
        val db = FirebaseFirestore.getInstance()
        val fourHoursAgo = Calendar.getInstance().apply { add(Calendar.HOUR, -4) }.time
        val timestamp = Timestamp(fourHoursAgo)

        db.collection("delays")
            .whereEqualTo("trainId", selectedTrain.number)
            .whereGreaterThan("createdAt", timestamp)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, e ->
                if (e != null) return@addSnapshotListener
                if (snapshot != null) {
                    delays.clear()
                    snapshot.documents.forEach { doc ->
                        val report = doc.toObject(DelayReport::class.java)?.copy(id = doc.id)
                        if (report != null) delays.add(report)
                    }
                }
            }
    }

    // Availability listener
    LaunchedEffect(selectedTrain) {
        val db = FirebaseFirestore.getInstance()
        val twoHoursAgo = Calendar.getInstance().apply { add(Calendar.HOUR, -2) }.time
        val timestamp = Timestamp(twoHoursAgo)

        db.collection("availability")
            .whereEqualTo("trainId", selectedTrain.number)
            .whereGreaterThan("createdAt", timestamp)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, e ->
                if (e != null) return@addSnapshotListener
                if (snapshot != null) {
                    availability.clear()
                    snapshot.documents.forEach { doc ->
                        val report = doc.toObject(CoachAvailability::class.java)?.copy(id = doc.id)
                        if (report != null) availability.add(report)
                    }
                }
            }
    }

    val avgDelay = if (delays.isEmpty()) 0 else delays.sumOf { it.minutes } / delays.size
    val topReason = remember(delays) {
        if (delays.isEmpty()) null
        else {
            val reasons = delays.mapNotNull { it.reason }.filter { it.isNotBlank() }
            if (reasons.isEmpty()) null
            else {
                reasons.groupBy { it }
                    .maxByOrNull { it.value.size }
                    ?.key
            }
        }
    }
    val trainStatus = remember(selectedTrain, avgDelay, trainLocation, selectedStation) {
        if (selectedTrain == null) return@remember TrainStatusInfo("Select Train", "Waiting", Color.Gray, Icons.Default.Info)
        
        var proximityLabel: String? = null
        var proximityIcon = Icons.Default.Timer
        var proximityColor = Color(0xFF10B981)

        if (trainLocation != null) {
            if (trainLocation.id == selectedStation.id) {
                proximityLabel = "At Station"
                proximityIcon = Icons.Default.Place
                proximityColor = Color(0xFFF97316)
            } else {
                val trainIdx = selectedTrain.route.indexOf(trainLocation.id)
                val stationIdx = selectedTrain.route.indexOf(selectedStation.id)
                if (trainIdx != -1 && stationIdx != -1 && trainIdx == stationIdx - 1) {
                    proximityLabel = "Approaching"
                    proximityIcon = Icons.Default.Navigation
                    proximityColor = Color(0xFF3B82F6)
                } else {
                    proximityLabel = "Last seen at ${trainLocation.name}"
                    proximityIcon = Icons.Default.History
                    proximityColor = Color(0xFF3B82F6).copy(alpha = 0.8f)
                }
            }
        }

        when {
            avgDelay > 15 -> TrainStatusInfo(proximityLabel ?: "Delayed", "${avgDelay}m late", Color(0xFFEF4444), Icons.Default.Warning, proximityLabel)
            avgDelay > 0 -> TrainStatusInfo(proximityLabel ?: "Running Late", "${avgDelay}m delay", Color(0xFFFACC15), Icons.Default.Timer, proximityLabel)
            else -> TrainStatusInfo(proximityLabel ?: "On Time", if (proximityLabel != null) "Running Smooth" else "Expected", proximityColor, if (proximityLabel != null) proximityIcon else Icons.Default.CheckCircle, proximityLabel)
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF171717),
                tonalElevation = 0.dp
            ) {
                listOf("Live", "Map", "Schedule", "Coach", "Alarm").forEach { tab ->
                    NavigationBarItem(
                        selected = activeTab == tab,
                        onClick = { activeTab = tab },
                        icon = {
                            Icon(
                                when (tab) {
                                    "Live" -> Icons.Default.Search
                                    "Map" -> Icons.Default.Map
                                    "Schedule" -> Icons.Default.CalendarToday
                                    "Coach" -> Icons.Default.ViewAgenda
                                    else -> Icons.Default.Notifications
                                },
                                contentDescription = tab
                            )
                        },
                        label = { Text(tab, fontSize = 10.sp, fontWeight = FontWeight.Bold) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFFF97316),
                            selectedTextColor = Color(0xFFF97316),
                            unselectedIconColor = Color(0xFF737373),
                            unselectedTextColor = Color(0xFF737373),
                            indicatorColor = Color.Transparent
                        )
                    )
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black)
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isSearching) {
                    TextField(
                        value = trainSearch,
                        onValueChange = { trainSearch = it },
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                        placeholder = { Text("Search train...", fontSize = 14.sp) },
                        colors = TextFieldDefaults.colors(
                            unfocusedContainerColor = Color(0xFF171717),
                            focusedContainerColor = Color(0xFF171717),
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp),
                        trailingIcon = {
                            Icon(
                                Icons.Default.Close,
                                null,
                                modifier = Modifier.clickable { 
                                    isSearching = false
                                    trainSearch = ""
                                },
                                tint = Color(0xFF737373)
                            )
                        },
                        singleLine = true
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFF97316))
                                .padding(6.dp)
                        ) {
                            Icon(Icons.Default.Train, null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(8.dp))
                        Text("Railu Buddy", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { isSearching = true }) {
                            Icon(Icons.Default.Search, null, tint = Color(0xFF737373))
                        }
                        if (user == null) {
                            Button(
                                onClick = { /* login */ },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF97316)),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                            ) {
                                Text("Login", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        } else {
                            IconButton(onClick = { showProfileDialog = true }) {
                                Icon(Icons.Default.AccountCircle, null, tint = Color(0xFF737373), modifier = Modifier.size(32.dp))
                            }
                        }
                    }
                }
            }

            if (isSearching && trainSearch.isNotEmpty()) {
                val filteredTrains = TRAINS.filter { 
                    it.name.contains(trainSearch, ignoreCase = true) || 
                    it.number.contains(trainSearch) 
                }
                if (filteredTrains.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF171717)),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(Modifier.padding(8.dp)) {
                            filteredTrains.forEach { train ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { 
                                            selectedTrain = train
                                            isSearching = false
                                            trainSearch = ""
                                        }
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Train, null, tint = Color(0xFFF97316), modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text(train.number, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        Text(train.name, color = Color(0xFF737373), fontSize = 10.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // Selector Cards
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0xFF171717))
                    .border(1.dp, Color(0xFF262626), RoundedCornerShape(24.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Tracking Visualization
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(80.dp)
                        .background(Color.Black, RoundedCornerShape(16.dp))
                        .padding(horizontal = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Route Line
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF262626)))
                    
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        selectedTrain.route.forEach { stationId ->
                            val isCurrent = trainLocation?.id == stationId
                            val isUserAt = selectedStation.id == stationId
                            
                            Box(contentAlignment = Alignment.TopCenter) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(
                                        Modifier
                                            .size(if (isCurrent) 10.dp else 6.dp)
                                            .background(if (isCurrent) Color(0xFFF97316) else Color(0xFF404040), CircleShape)
                                    )
                                    Text(
                                        stationId,
                                        fontSize = 8.sp,
                                        color = if (isCurrent) Color(0xFFF97316) else Color(0xFF525252),
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                                
                                if (isCurrent) {
                                    Icon(
                                        Icons.Default.Train,
                                        null,
                                        tint = Color(0xFFF97316),
                                        modifier = Modifier.size(16.dp).offset(y = (-20).dp)
                                    )
                                }
                                if (isUserAt && !isCurrent) {
                                    Icon(
                                        Icons.Default.PersonPinCircle,
                                        null,
                                        tint = Color.White,
                                        modifier = Modifier.size(12.dp).offset(y = (-16).dp)
                                    )
                                }
                            }
                        }
                    }
                }

                // Station Selector
                Column {
                    Text("LIVE STATION", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { /* Show BottomSheet/Dialog to pick station */ },
                        color = Color.Black,
                        border = border(1.dp, Color(0xFF262626), RoundedCornerShape(12.dp))
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Map, null, tint = Color(0xFF737373), modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(selectedStation.name, color = Color.White, fontSize = 14.sp)
                        }
                    }
                }

                // Train Selector
                Column {
                    Text("CURRENT TRAIN", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { /* Show pick train */ },
                        color = Color.Black,
                        border = border(1.dp, Color(0xFF262626), RoundedCornerShape(12.dp))
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Navigation, null, tint = Color(0xFF737373), modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("${selectedTrain.number} - ${selectedTrain.name}", color = Color.White, fontSize = 14.sp)
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.Black.copy(alpha = 0.4f),
                        shape = RoundedCornerShape(16.dp),
                        border = border(1.dp, Color(0xFF262626), RoundedCornerShape(16.dp))
                    ) {
                        Row(
                            Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier
                                        .background(trainStatus.third.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                                        .padding(8.dp)
                                ) {
                                    Icon(Icons.Default.AccessTime, null, tint = trainStatus.third, modifier = Modifier.size(16.dp))
                                }
                                Spacer(Modifier.width(12.dp))
                                Column {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            trainStatus.first,
                                            color = Color.White,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 12.sp
                                        )
                                        Spacer(Modifier.width(6.dp))
                                        Box(Modifier.size(3.dp).background(Color(0xFF404040), CircleShape))
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            trainStatus.second,
                                            color = trainStatus.third,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                    Text(
                                        if (trainLocation != null) "Currently at ${trainLocation?.name}" else "Tracking is live",
                                        color = Color(0xFF525252),
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            
                            Button(
                                onClick = { if (user != null) showDelayDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF262626)),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text("Report", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF262626)))
                    Spacer(Modifier.height(16.dp))

                    // Coach Composition
                    Column {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("COACH COMPOSITION", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Text("FRONT → BACK", color = Color(0xFF404040), fontSize = 8.sp, fontWeight = FontWeight.Black)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            selectedTrain.coaches.forEach { coach ->
                                val info = getCoachInfo(coach)
                                Column(
                                    modifier = Modifier
                                        .size(width = 40.dp, height = 52.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(info.bgColor)
                                        .border(1.dp, info.borderColor, RoundedCornerShape(12.dp)),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        info.imageVector,
                                        null,
                                        tint = info.color,
                                        modifier = Modifier.size(16.dp).let {
                                            if (coach == "Engine") it.rotate(180f) else it
                                        }
                                    )
                                    Text(
                                        coach.take(3),
                                        color = info.color,
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.Black
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // Route Summary
                    Column {
                        Text("MAIN ROUTE STOPS", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFF262626), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                                .horizontalScroll(rememberScrollState()),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            selectedTrain.route.forEachIndexed { idx, stationId ->
                                val station = STATIONS.find { it.id == stationId }
                                Column(
                                    modifier = Modifier
                                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                                        .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(station?.name ?: stationId, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
                                    Text(stationId, color = Color(0xFF525252), fontSize = 7.sp, fontWeight = FontWeight.Bold)
                                }
                                if (idx < selectedTrain.route.size - 1) {
                                    Icon(
                                        Icons.Default.ChevronRight,
                                        null,
                                        tint = Color(0xFF262626),
                                        modifier = Modifier.size(16.dp).padding(horizontal = 2.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (showProfileDialog && user != null) {
                AlertDialog(
                    onDismissRequest = { showProfileDialog = false },
                    containerColor = Color(0xFF171717),
                    title = {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            if (user.photoUrl != null) {
                                AsyncImage(
                                    model = user.photoUrl.toString(),
                                    contentDescription = null,
                                    modifier = Modifier.size(80.dp).clip(CircleShape).border(2.dp, Color(0xFFF97316), CircleShape)
                                )
                            } else {
                                Icon(Icons.Default.AccountCircle, null, tint = Color(0xFFF97316), modifier = Modifier.size(80.dp))
                            }
                            Spacer(Modifier.height(12.dp))
                            Text(user.displayName ?: "User", color = Color.White, fontWeight = FontWeight.Black, fontSize = 20.sp)
                            Text(user.email ?: "", color = Color(0xFF737373), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = Color.Black)) {
                                    Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("${userPings.size + userDelays.size + userAvailability.size}", color = Color.White, fontWeight = FontWeight.Black, fontSize = 18.sp)
                                        Text("REPORTS", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = Color.Black)) {
                                    Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("TOP 8%", color = Color(0xFFF97316), fontWeight = FontWeight.Black, fontSize = 18.sp)
                                        Text("RANKING", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            Text("RECENT CONTRIBUTIONS", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                val combinedItems = mutableListOf<Triple<String, String, String>>() // Label, TrainId, Type
                                userPings.take(2).forEach { combinedItems.add(Triple("PF ${it.platform} update", it.trainId, "ping")) }
                                userDelays.take(2).forEach { combinedItems.add(Triple("Reported ${it.minutes}m delay", it.trainId, "delay")) }
                                userAvailability.take(2).forEach { combinedItems.add(Triple("Coach ${it.coachId}: ${it.status}", it.trainId, "avail")) }

                                combinedItems.take(5).forEach { item ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.3f), RoundedCornerShape(8.dp)).padding(8.dp)
                                    ) {
                                        Icon(
                                            when(item.third) {
                                                "delay" -> Icons.Default.AccessTime
                                                "avail" -> Icons.Default.ViewAgenda
                                                else -> Icons.Default.Wifi
                                            },
                                            null, 
                                            tint = if (item.third == "delay") Color(0xFFF97316) else Color(0xFF737373), 
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(Modifier.width(12.dp))
                                        Column {
                                            Text(item.first, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            Text("TRAIN ${item.second}", color = Color(0xFF525252), fontSize = 8.sp, fontWeight = FontWeight.Black)
                                        }
                                    }
                                }
                                if (combinedItems.isEmpty()) {
                                    Text("No contributions yet", color = Color(0xFF525252), fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp))
                                }
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = { 
                            FirebaseAuth.getInstance().signOut()
                            showProfileDialog = false
                        }) {
                            Text("Logout", color = Color.Red)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showProfileDialog = false }) {
                            Text("Close", color = Color.White)
                        }
                    }
                )
            }

            if (showDelayDialog) {
                AlertDialog(
                    onDismissRequest = { showDelayDialog = false },
                    containerColor = Color(0xFF171717),
                    title = { Text("Report Delay", color = Color.White, fontWeight = FontWeight.Bold) },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text("How late is the train?", color = Color(0xFF737373), fontSize = 12.sp)
                            
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf(5, 15, 30).forEach { mins ->
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .background(Color.Black, RoundedCornerShape(12.dp))
                                            .clickable { 
                                                val db = FirebaseFirestore.getInstance()
                                                val report = DelayReport(
                                                    trainId = selectedTrain.number,
                                                    minutes = mins,
                                                    reason = "Late Arrival",
                                                    reportedBy = user?.uid ?: "",
                                                    createdAt = Timestamp.now()
                                                )
                                                db.collection("delays").add(report)
                                                showDelayDialog = false
                                            }
                                            .padding(16.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("${mins}m", color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = { showDelayDialog = false }) {
                            Text("Cancel", color = Color(0xFF737373))
                        }
                    }
                )
            }

            Spacer(Modifier.height(24.dp))

            // Tab Content
            when (activeTab) {
                "Live" -> LiveTab(
                    pings, 
                    user?.uid, 
                    trainStatus, 
                    topReason, 
                    avgDelay, 
                    platformSuggestions, 
                    isOnTrain, 
                    destinationStation, 
                    distanceToDest
                ) { pf ->
                    if (user != null) {
                        val db = FirebaseFirestore.getInstance()
                        val expiry = Calendar.getInstance().apply { add(Calendar.MINUTE, 30) }.time
                        val ping = PlatformPing(
                            trainId = selectedTrain.number,
                            stationId = selectedStation.id,
                            platform = pf,
                            reportedBy = user.uid,
                            confirmedBy = emptyList(),
                            createdAt = Timestamp.now(),
                            expiresAt = Timestamp(expiry)
                        )
                        db.collection("pings").add(ping)
                    }
                }
                "Map" -> MapTab(selectedTrain, trainLocation, currentLocation)
                "Schedule" -> ScheduleTab(selectedTrain, trainLocation, selectedStation)
                "Coach" -> CoachTab(selectedTrain, availability, user?.uid)
                "Alarm" -> AlarmTab(destinationStation, alarmActive, distanceToDest) { station, active ->
                    destinationStation = station
                    alarmActive = active
                }
            }
        }
    }
}

@Composable
fun LiveTab(
    pings: List<PlatformPing>, 
    userId: String?, 
    trainStatus: TrainStatusInfo,
    topReason: String?,
    avgDelay: Int,
    suggestions: List<String>,
    isOnTrain: Boolean,
    destination: Station?,
    distanceToDest: Double?,
    onReport: (String) -> Unit
) {
    Column {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Platform Pings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Box(
                Modifier
                    .background(Color(0xFF171717), RoundedCornerShape(100.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text("REAL-TIME", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(16.dp))

        // Train Status Card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp)
                .clip(RoundedCornerShape(32.dp))
                .background(trainStatus.color.copy(alpha = 0.1f))
                .border(1.dp, trainStatus.color.copy(alpha = 0.2f), RoundedCornerShape(32.dp))
                .padding(24.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .background(trainStatus.color, RoundedCornerShape(12.dp))
                            .padding(8.dp)
                    ) {
                        Icon(trainStatus.icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text("CURRENT STATUS", color = trainStatus.color, fontSize = 10.sp, fontWeight = FontWeight.Black)
                        Text(trainStatus.label, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black, italic = true)
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // Delay Info
                Box(
                    Modifier
                        .weight(1f)
                        .background(Color.Black.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(12.dp)
                ) {
                    Column {
                        Text("DELAY INFO", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Black)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Clock, null, tint = if (avgDelay > 0) Color.Yellow else Color.Green, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (avgDelay > 0) "${avgDelay}m Delay" else "On Time", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
                // Reliability
                Box(
                    Modifier
                        .weight(1f)
                        .background(Color.Black.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(12.dp)
                ) {
                    Column {
                        Text("RELIABILITY", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Black)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Shield, null, tint = Color(0xFF3B82F6), modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (pings.size > 5) "High" else "Medium", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }

            trainStatus.proximity?.let {
                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(100.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(4.dp).background(Color(0xFFF97316), CircleShape))
                        Spacer(Modifier.width(6.dp))
                        Text(it.uppercase(), color = Color(0xFFFED7AA), fontSize = 9.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }

        // On Train Indicator
        AnimatedVisibility(visible = isOnTrain && destination != null && distanceToDest != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp)
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color(0xFFF97316).copy(alpha = 0.1f))
                    .border(1.dp, Color(0xFFF97316).copy(alpha = 0.2f), RoundedCornerShape(32.dp))
                    .padding(24.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFF97316), RoundedCornerShape(12.dp))
                                .padding(8.dp)
                        ) {
                            Icon(Icons.Default.Train, null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(6.dp).background(Color(0xFFF97316), CircleShape))
                                Spacer(Modifier.width(6.dp))
                                Text("ON TRAIN", color = Color(0xFFF97316), fontSize = 10.sp, fontWeight = FontWeight.Black)
                            }
                            Text("Heading to ${destination?.name}", color = Color.White, fontWeight = FontWeight.Black, italic = true)
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(String.format("%.1f km", distanceToDest ?: 0.0), color = Color(0xFFF97316), fontWeight = FontWeight.Black, fontSize = 20.sp)
                        Text("REMAINING", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Black)
                    }
                }
                
                Spacer(Modifier.height(16.dp))
                
                Column(Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .background(Color.Black.copy(alpha = 0.4f), CircleShape)
                    ) {
                        val progress = (1.0 - ((distanceToDest ?: 0.0) / 100.0)).coerceIn(0.05, 1.0)
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(progress.toFloat())
                                .background(
                                    Brush.horizontalGradient(listOf(Color(0xFFEA580C), Color(0xFFFB923C))),
                                    CircleShape
                                )
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("DEPARTURE", color = Color(0xFF404040), fontSize = 7.sp, fontWeight = FontWeight.Black)
                        Text("ARRIVING SOON", color = Color(0xFF737373), fontSize = 7.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }

        if (pings.isEmpty()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .border(2.dp, Color(0xFF171717), RoundedCornerShape(24.dp))
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "No live pings. Check announcements or report below!",
                    color = Color(0xFF525252),
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center
                )
            }
        } else {
            pings.forEach { ping ->
                PlatformPingItem(ping, userId, trainStatus, topReason, avgDelay, isOnTrain)
                Spacer(Modifier.height(12.dp))
            }
        }

        Spacer(Modifier.height(24.dp))
        
        if (suggestions.isNotEmpty() && userId != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF171717).copy(alpha = 0.5f), RoundedCornerShape(24.dp))
                    .border(1.dp, Color(0xFF262626).copy(alpha = 0.5f), RoundedCornerShape(24.dp))
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(6.dp).background(Color(0xFFF97316), CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text("SUGGESTED PLATFORMS", color = Color(0xFFF97316), fontSize = 9.sp, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    suggestions.forEach { pf ->
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFF97316).copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFFF97316).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                .clickable { onReport(pf) }
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text("PF $pf", color = Color(0xFFF97316), fontWeight = FontWeight.Black, fontSize = 14.sp)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }

        Text("REPORT PLATFORM", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("1", "2", "3", "4").forEach { pf ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF171717))
                        .clickable { onReport(pf) },
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("PF", fontSize = 10.sp, color = Color(0xFF737373), fontWeight = FontWeight.Bold)
                        Text(pf, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
fun PlatformPingItem(ping: PlatformPing, userId: String?, trainStatus: TrainStatusInfo, topReason: String?, avgDelay: Int, isOnTrain: Boolean) {
    val isConfirmed = userId != null && ping.confirmedBy.contains(userId)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF171717))
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("PF ${ping.platform}", fontSize = 32.sp, fontWeight = FontWeight.Black, color = Color(0xFFF97316))
                Spacer(Modifier.width(12.dp))
                Column {
                    Box(
                        Modifier
                            .background(Color(0xFF10B981).copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF10B981), modifier = Modifier.size(10.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("LIVE", color = Color(0xFF10B981), fontSize = 7.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .background(trainStatus.color.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(trainStatus.icon, null, tint = trainStatus.color, modifier = Modifier.size(10.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(trainStatus.label.uppercase(), color = trainStatus.color, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        if (isOnTrain) {
                            Spacer(Modifier.width(8.dp))
                            Box(
                                Modifier
                                    .background(Color(0xFFF97316), RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Train, null, tint = Color.White, modifier = Modifier.size(10.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("ON TRAIN", color = Color.White, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    if (topReason != null && avgDelay > 0) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "REASON: ${topReason.uppercase()}", 
                            color = Color.White.copy(alpha = 0.4f), 
                            fontSize = 7.sp, 
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            }
            Text("Confirmed by ${ping.confirmedBy.size} passengers", color = Color(0xFF737373), fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        }

        Button(
            onClick = { /* Handle Confirm */ },
            enabled = !isConfirmed,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isConfirmed) Color(0xFF262626) else Color(0xFFF97316),
                disabledContainerColor = Color(0xFF262626)
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(if (isConfirmed) "Done" else "Confirm", fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

data class TrainStatusInfo(
    val label: String,
    val subLabel: String,
    val color: Color,
    val icon: ImageVector,
    val proximity: String? = null
)

data class CoachInfo(
    val name: String,
    val icon: org.compose.material.icons.IconResource? = null, // Using IconResource or just ImageVector
    val imageVector: androidx.compose.ui.graphics.vector.ImageVector,
    val color: Color,
    val bgColor: Color,
    val borderColor: Color
)

@Composable
fun getCoachInfo(code: String): CoachInfo {
    return when {
        code == "Engine" -> CoachInfo("Locomotive", imageVector = Icons.Default.Navigation, color = Color(0xFFF87171), bgColor = Color(0xFFF87171).copy(alpha = 0.1f), borderColor = Color(0xFFF87171).copy(alpha = 0.2f))
        code == "Ladies" -> CoachInfo("Ladies Only", imageVector = Icons.Default.Person, color = Color(0xFFF472B6), bgColor = Color(0xFFF472B6).copy(alpha = 0.1f), borderColor = Color(0xFFF472B6).copy(alpha = 0.2f))
        code == "Handicapped" -> CoachInfo("Handicapped", imageVector = Icons.Default.Accessible, color = Color(0xFF60A5FA), bgColor = Color(0xFF60A5FA).copy(alpha = 0.1f), borderColor = Color(0xFF60A5FA).copy(alpha = 0.2f))
        code == "General" || code == "UR" -> CoachInfo("General/UR", imageVector = Icons.Default.Groups, color = Color(0xFFA3A3A3), bgColor = Color(0xFF171717), borderColor = Color(0xFF262626))
        code.startsWith("S") -> CoachInfo("Sleeper ($code)", imageVector = Icons.Default.Bed, color = Color(0xFFFB923C), bgColor = Color(0xFFFB923C).copy(alpha = 0.1f), borderColor = Color(0xFFFB923C).copy(alpha = 0.2f))
        code.startsWith("B") -> CoachInfo("AC 3-Tier ($code)", imageVector = Icons.Default.AcUnit, color = Color(0xFF22D3EE), bgColor = Color(0xFF22D3EE).copy(alpha = 0.1f), borderColor = Color(0xFF22D3EE).copy(alpha = 0.2f))
        code.startsWith("A") -> CoachInfo("AC 2-Tier ($code)", imageVector = Icons.Default.AcUnit, color = Color(0xFF818CF8), bgColor = Color(0xFF818CF8).copy(alpha = 0.1f), borderColor = Color(0xFF818CF8).copy(alpha = 0.2f))
        code.startsWith("H") -> CoachInfo("AC 1st Class ($code)", imageVector = Icons.Default.Star, color = Color(0xFFFACC15), bgColor = Color(0xFFFACC15).copy(alpha = 0.1f), borderColor = Color(0xFFFACC15).copy(alpha = 0.2f))
        code.startsWith("D") -> CoachInfo("Second Seating ($code)", imageVector = Icons.Default.Chair, color = Color(0xFFD4D4D4), bgColor = Color(0xFF171717), borderColor = Color(0xFF262626))
        code.startsWith("C") -> CoachInfo("AC Chair Car ($code)", imageVector = Icons.Default.AcUnit, color = Color(0xFF93C5FD), bgColor = Color(0xFF93C5FD).copy(alpha = 0.1f), borderColor = Color(0xFF93C5FD).copy(alpha = 0.2f))
        code == "Guard" || code == "SLR" -> CoachInfo("Guard/Brake", imageVector = Icons.Default.Security, color = Color(0xFFA3A3A3), bgColor = Color(0xFF171717), borderColor = Color(0xFF262626))
        else -> CoachInfo("Coach $code", imageVector = Icons.Default.ViewAgenda, color = Color(0xFFA3A3A3), bgColor = Color(0xFF171717), borderColor = Color(0xFF262626))
    }
}

@Composable
fun CoachTab(train: Train, availability: List<CoachAvailability>, userId: String?) {
    Column {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Coach Position", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(Color.Red))
                Spacer(Modifier.width(4.dp))
                Text("FRONT (ENGINE)", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(16.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            items(train.coaches.withIndex().toList()) { (idx, coach) ->
                val info = getCoachInfo(coach)
                val latestReport = availability.firstOrNull { it.coachId == coach }
                val timeAgo = latestReport?.createdAt?.let { 
                    (System.currentTimeMillis() - it.toDate().time) / 60000 
                }
                
                val statusInfo = when (latestReport?.status) {
                    "empty" -> Triple("Plenty of Seats", Color(0xFF10B981), 0.2f)
                    "moderate" -> Triple("Moderate Crowd", Color(0xFFFACC15), 0.6f)
                    "full" -> Triple("Standing Room Only", Color(0xFFEF4444), 0.95f)
                    else -> Triple("No recent reports", Color(0xFF525252), 0f)
                }

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .border(1.dp, Color(0xFF262626), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("${idx + 1}", color = Color(0xFF525252), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.width(16.dp))
                        
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(16.dp))
                                .background(info.bgColor)
                                .border(1.dp, info.borderColor, RoundedCornerShape(16.dp))
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(info.name, fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White)
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(0.7f),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        statusInfo.first.uppercase(),
                                        fontSize = 8.sp, 
                                        color = statusInfo.second, 
                                        fontWeight = FontWeight.Bold
                                    )
                                    timeAgo?.let {
                                        Text(
                                            if (it == 0L) "JUST NOW" else "${it}M AGO",
                                            fontSize = 7.sp,
                                            color = Color(0xFF404040),
                                            fontWeight = FontWeight.Black
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Box(
                                    modifier = Modifier
                                        .width(120.dp)
                                        .height(4.dp)
                                        .background(Color.White.copy(alpha = 0.05f), CircleShape)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxHeight()
                                            .fillMaxWidth(statusInfo.third)
                                            .background(statusInfo.second, CircleShape)
                                    )
                                }
                            }
                            Box(
                                Modifier
                                    .background(Color.Black.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                                    .padding(8.dp)
                            ) {
                                Icon(
                                    info.imageVector, 
                                    null, 
                                    tint = info.color, 
                                    modifier = Modifier.size(20.dp).let { 
                                        if (coach == "Engine") it.rotate(180f) else it 
                                    }
                                )
                            }
                        }
                    }

                    if (userId != null) {
                        Row(
                            Modifier.padding(start = 40.dp, top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf("empty", "moderate", "full").forEach { status ->
                                val isSelected = latestReport?.status == status
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .border(
                                            1.dp, 
                                            if (isSelected) Color.White else Color(0xFF262626), 
                                            CircleShape
                                        )
                                        .background(if (isSelected) Color.White else Color.Transparent)
                                        .clickable {
                                            val db = FirebaseFirestore.getInstance()
                                            db.collection("availability").add(
                                                CoachAvailability(
                                                    trainId = train.number,
                                                    coachId = coach,
                                                    status = status,
                                                    reportedBy = userId,
                                                    createdAt = Timestamp.now()
                                                )
                                            )
                                        }
                                        .padding(horizontal = 12.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        status.uppercase(),
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.Black,
                                        color = if (isSelected) Color.Black else Color(0xFF525252)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MapTab(train: Train, trainLocation: Station?, userLocation: Pair<Double, Double>?) {
    val bengaluru = LatLng(12.9777, 77.5726)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(bengaluru, 8f)
    }

    val routeStations = train.route.mapNotNull { id -> STATIONS.find { it.id == id } }
    
    LaunchedEffect(routeStations) {
        if (routeStations.isNotEmpty()) {
            val bounds = LatLngBounds.Builder()
            routeStations.forEach { bounds.include(LatLng(it.latitude, it.longitude)) }
            cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(bounds.build(), 100))
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(500.dp)
            .clip(RoundedCornerShape(32.dp))
            .border(1.dp, Color(0xFF262626), RoundedCornerShape(32.dp))
    ) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                mapStyleOptions = MapStyleOptions(DARK_MAP_STYLE),
                isMyLocationEnabled = false // We'll draw our own user marker
            ),
            uiSettings = MapUiSettings(zoomControlsEnabled = false)
        ) {
            // Draw Route
            if (routeStations.size >= 2) {
                Polyline(
                    points = routeStations.map { LatLng(it.latitude, it.longitude) },
                    color = Color(0xFFF97316),
                    width = 8f
                )
            }

            // Station Markers
            routeStations.forEach { station ->
                MarkerComposable(
                    state = MarkerState(position = LatLng(station.latitude, station.longitude)),
                    title = station.name
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .background(Color(0xFF171717), CircleShape)
                                .border(2.dp, Color(0xFFF97316), CircleShape)
                        )
                        Spacer(Modifier.height(2.dp))
                        Surface(
                            color = Color.Black.copy(alpha = 0.7f),
                            shape = RoundedCornerShape(4.dp),
                            border = border(0.5.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                        ) {
                            Text(
                                station.id,
                                color = Color.White,
                                fontSize = 8.sp,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    }
                }
            }

            // Train Marker
            trainLocation?.let {
                MarkerComposable(
                    state = MarkerState(position = LatLng(it.latitude, it.longitude)),
                    title = "Train Location",
                    zIndex = 2f
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(Color(0xFFF97316), CircleShape)
                            .border(2.dp, Color.White, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Train,
                            null,
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }

            // User Marker
            userLocation?.let { (lat, lng) ->
                MarkerComposable(
                    state = MarkerState(position = LatLng(lat, lng)),
                    title = "Your Location",
                    zIndex = 3f
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(Color(0xFF3B82F6), CircleShape)
                            .border(2.dp, Color.White, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Person,
                            null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }

        // Overlay Info
        Box(
            modifier = Modifier
                .padding(16.dp)
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(Color(0xFF171717).copy(alpha = 0.8f), RoundedCornerShape(24.dp))
                .border(1.dp, Color(0xFF262626), RoundedCornerShape(24.dp))
                .padding(16.dp)
        ) {
            Column {
                Text(train.name, color = Color.White, fontWeight = FontWeight.Black, fontSize = 14.sp)
                Text("FULL ROUTE VIEW", color = Color(0xFF737373), fontSize = 8.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

const val DARK_MAP_STYLE = "[" +
    "  {" +
    "    \"elementType\": \"geometry\"," +
    "    \"stylers\": [{\"color\": \"#212121\"}]" +
    "  }," +
    "  {" +
    "    \"elementType\": \"labels.icon\"," +
    "    \"stylers\": [{\"visibility\": \"off\"}]" +
    "  }," +
    "  {" +
    "    \"elementType\": \"labels.text.fill\"," +
    "    \"stylers\": [{\"color\": \"#757575\"}]" +
    "  }," +
    "  {" +
    "    \"elementType\": \"labels.text.stroke\"," +
    "    \"stylers\": [{\"color\": \"#212121\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"administrative\"," +
    "    \"elementType\": \"geometry\"," +
    "    \"stylers\": [{\"color\": \"#757575\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"administrative.country\"," +
    "    \"elementType\": \"labels.text.fill\"," +
    "    \"stylers\": [{\"color\": \"#9e9e9e\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"poi\"," +
    "    \"elementType\": \"labels.text.fill\"," +
    "    \"stylers\": [{\"color\": \"#757575\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"poi.park\"," +
    "    \"elementType\": \"geometry\"," +
    "    \"stylers\": [{\"color\": \"#181818\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"road\"," +
    "    \"elementType\": \"geometry.fill\"," +
    "    \"stylers\": [{\"color\": \"#2c2c2c\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"road\"," +
    "    \"elementType\": \"labels.text.fill\"," +
    "    \"stylers\": [{\"color\": \"#8a8a8a\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"road.highway\"," +
    "    \"elementType\": \"geometry\"," +
    "    \"stylers\": [{\"color\": \"#3c3c3c\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"water\"," +
    "    \"elementType\": \"geometry\"," +
    "    \"stylers\": [{\"color\": \"#000000\"}]" +
    "  }," +
    "  {" +
    "    \"featureType\": \"water\"," +
    "    \"elementType\": \"labels.text.fill\"," +
    "    \"stylers\": [{\"color\": \"#3d3d3d\"}]" +
    "  }" +
    "]"

@Composable
fun AlarmTab(destination: Station?, active: Boolean, distance: Double?, onUpdate: (Station?, Boolean) -> Unit) {
    Column {
        Text("Wake-up Alarm", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        Column(
            Modifier
                .fillMaxWidth()
                .background(Color(0xFF171717), RoundedCornerShape(24.dp))
                .border(1.dp, Color(0xFF262626), RoundedCornerShape(24.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Column {
                Text("DESTINATION STATION", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .clickable { /* Picker */ },
                    color = Color.Black
                ) {
                    Text(
                        destination?.name ?: "Select Destination",
                        modifier = Modifier.padding(16.dp),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Color.Black, RoundedCornerShape(16.dp))
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .background(if (active) Color(0xFF10B981) else Color(0xFF262626), RoundedCornerShape(12.dp))
                            .padding(8.dp)
                    ) {
                        Icon(Icons.Default.Notifications, null, tint = Color.White, modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("Alarm Status", fontWeight = FontWeight.Bold, color = Color.White)
                        Text("TRIGGERS AT 5KM", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Switch(
                    checked = active,
                    onCheckedChange = { onUpdate(destination, it) },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = Color(0xFF10B981)
                    )
                )
            }

            if (active && distance != null) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        String.format("%.1f", distance),
                        fontSize = 64.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFFF97316),
                        letterSpacing = (-2).sp
                    )
                    Text("DISTANCE (KM)", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                }
            }
        }
    }
}

@Composable
fun ScheduleTab(train: Train, trainLocation: Station?, selectedStation: Station) {
    Column {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Full Timetable", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Box(
                Modifier
                    .background(Color(0xFF171717), RoundedCornerShape(100.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text("${train.number} ${train.name}", color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF171717)),
            shape = RoundedCornerShape(24.dp),
            border = border(1.dp, Color(0xFF262626), RoundedCornerShape(24.dp))
        ) {
            Column {
                // Header
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.4f))
                        .padding(16.dp)
                ) {
                    Text("STATION", Modifier.weight(0.5f), color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Black)
                    Text("ARR.", Modifier.weight(0.25f), color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Text("DEP.", Modifier.weight(0.25f), color = Color(0xFF737373), fontSize = 10.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                }

                train.schedule.forEach { item ->
                    val station = STATIONS.find { it.id == item.stationId }
                    val isCurrent = trainLocation?.id == item.stationId
                    val isSelected = selectedStation.id == item.stationId

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                when {
                                    isCurrent -> Color(0xFFF97316).copy(alpha = 0.05f)
                                    isSelected -> Color.White.copy(alpha = 0.05f)
                                    else -> Color.Transparent
                                }
                            )
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(Modifier.weight(0.5f), verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(6.dp)
                                    .background(
                                        if (isCurrent) Color(0xFFF97316) else Color(0xFF404040),
                                        CircleShape
                                    )
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    station?.name ?: "",
                                    color = if (isCurrent) Color(0xFFF97316) else Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Black
                                )
                                Text(item.stationId, color = Color(0xFF525252), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Text(
                            item.arrival,
                            Modifier.weight(0.25f),
                            color = if (item.arrival == "Starts") Color(0xFF404040) else Color(0xFFD4D4D4),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            item.departure,
                            Modifier.weight(0.25f),
                            color = if (item.departure == "Ends") Color(0xFF404040) else Color(0xFFD4D4D4),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            textAlign = TextAlign.Center
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF262626)))
                }
            }
        }
        
        Spacer(Modifier.height(16.dp))
        Text(
            "ALL TIMES IN 24-HOUR FORMAT",
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
            color = Color(0xFF404040),
            fontSize = 9.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.sp
        )
    }
}

fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2).pow(2.0) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2.0)
    val c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c
}
