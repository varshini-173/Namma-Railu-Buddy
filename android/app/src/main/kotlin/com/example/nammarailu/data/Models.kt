package com.example.nammarailu.data

import com.google.firebase.Timestamp

data class Station(
    val id: String = "",
    val name: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0
)

data class Train(
    val number: String = "",
    val name: String = "",
    val coaches: List<String> = emptyList(),
    val route: List<String> = emptyList(),
    val schedule: List<ScheduleItem> = emptyList()
)

data class ScheduleItem(
    val stationId: String = "",
    val arrival: String = "",
    val departure: String = ""
)

data class PlatformPing(
    val id: String = "",
    val trainId: String = "",
    val stationId: String = "",
    val platform: String = "",
    val confirmedBy: List<String> = emptyList(),
    val reportedBy: String = "",
    val createdAt: Timestamp? = null,
    val expiresAt: Timestamp? = null
)

data class DelayReport(
    val id: String = "",
    val trainId: String = "",
    val minutes: Int = 0,
    val reason: String = "",
    val reportedBy: String = "",
    val createdAt: Timestamp? = null
)

data class CoachAvailability(
    val id: String = "",
    val trainId: String = "",
    val coachId: String = "",
    val status: String = "", // empty, moderate, full
    val reportedBy: String = "",
    val createdAt: Timestamp? = null
)

val STATIONS = listOf(
    Station("SBC", "KSR Bengaluru", 12.9777, 77.5726),
    Station("MYS", "Mysuru Junction", 12.3164, 76.6450),
    Station("MYA", "Mandya", 12.5222, 76.8967),
    Station("CPT", "Channapatna", 12.6517, 77.2091),
    Station("RMGM", "Ramanagaram", 12.7247, 77.2847),
    Station("BID", "Bidadi", 12.8000, 77.3881),
    Station("YPR", "Yesvantpur", 13.0238, 77.5501),
    Station("TK", "Tumakuru", 13.3421, 77.1017),
    Station("RRB", "Birur Junction", 13.5937, 75.9680)
)

val TRAINS = listOf(
    Train(
        "06256", 
        "MYS-SBC MEMU Passenger", 
        listOf("Engine", "General", "General", "Ladies", "General", "General", "Handicapped", "General", "General"), 
        listOf("MYS", "MYA", "RMGM", "BID", "SBC"),
        listOf(
            ScheduleItem("MYS", "Starts", "06:10"),
            ScheduleItem("MYA", "06:55", "06:57"),
            ScheduleItem("RMGM", "07:45", "07:46"),
            ScheduleItem("BID", "07:58", "07:59"),
            ScheduleItem("SBC", "09:15", "Ends")
        )
    ),
    Train(
        "16232", 
        "Mailaduturai Express", 
        listOf("Engine", "General", "General", "S1", "S2", "S3", "S4", "B1", "B2", "A1", "General", "General"), 
        listOf("MYS", "SBC", "YPR"),
        listOf(
            ScheduleItem("MYS", "Starts", "16:15"),
            ScheduleItem("SBC", "19:00", "19:15"),
            ScheduleItem("YPR", "19:35", "Ends")
        )
    ),
    Train(
        "20661", 
        "SBC-MYS Rajya Rani Express", 
        listOf("Engine", "General", "General", "D1", "D2", "D3", "D4", "D5", "C1", "C2", "General", "General"), 
        listOf("SBC", "BID", "RMGM", "MYA", "MYS"),
        listOf(
            ScheduleItem("SBC", "Starts", "17:50"),
            ScheduleItem("BID", "18:22", "18:23"),
            ScheduleItem("RMGM", "18:35", "18:36"),
            ScheduleItem("MYA", "19:18", "19:20"),
            ScheduleItem("MYS", "20:30", "Ends")
        )
    ),
    Train(
        "16535",
        "MYS-SUR Golgumbaz Express",
        listOf("Engine", "General", "S1", "S2", "S3", "S4", "S5", "B1", "B2", "A1", "General"),
        listOf("MYS", "MYA", "CPT", "RMGM", "SBC", "YPR", "TK", "RRB"),
        listOf(
            ScheduleItem("MYS", "Starts", "15:30"),
            ScheduleItem("MYA", "16:18", "16:20"),
            ScheduleItem("CPT", "16:47", "16:48"),
            ScheduleItem("RMGM", "16:58", "16:59"),
            ScheduleItem("SBC", "18:00", "18:20"),
            ScheduleItem("YPR", "18:33", "18:35"),
            ScheduleItem("TK", "19:28", "19:30"),
            ScheduleItem("RRB", "21:05", "Ends")
        )
    ),
    Train(
        "06575",
        "SBC-TK MEMU Passenger",
        listOf("Engine", "General", "General", "General", "General", "General", "General"),
        listOf("SBC", "YPR", "TK"),
        listOf(
            ScheduleItem("SBC", "Starts", "08:30"),
            ScheduleItem("YPR", "08:42", "08:44"),
            ScheduleItem("TK", "09:45", "Ends")
        )
    ),
    Train(
        "12614",
        "MYS-SBC Tipu Express",
        listOf("Engine", "General", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "General"),
        listOf("MYS", "MYA", "SBC"),
        listOf(
            ScheduleItem("MYS", "Starts", "11:30"),
            ScheduleItem("MYA", "12:13", "12:15"),
            ScheduleItem("SBC", "13:45", "Ends")
        )
    )
)
