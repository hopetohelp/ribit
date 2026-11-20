package com.hopetohelp.ribit.data

import android.content.Context
import android.util.Base64
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.hopetohelp.ribit.domain.Calculation
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive

@Entity(tableName = "calculations")
data class SavedCalculation(
    @PrimaryKey val id: String,
    val title: String,
    val updatedAt: Long,
    val planCount: Int,
    val snapshot: String,
)

@Serializable
data class SavedSummary(
    val id: String,
    val title: String,
    val updatedAt: Long,
    val planCount: Int,
)

data class BackupEntry(val title: String, val updatedAt: Long, val planCount: Int, val calculation: JsonObject)

@Dao
interface CalculationDao {
    @Query("SELECT id, title, updatedAt, planCount FROM calculations ORDER BY updatedAt DESC, id")
    fun observeAll(): Flow<List<SavedSummary>>

    @Query("SELECT * FROM calculations WHERE id = :id")
    suspend fun find(id: String): SavedCalculation?

    @Upsert
    suspend fun save(calculation: SavedCalculation)

    @Insert
    suspend fun insertAll(calculations: List<SavedCalculation>)

    @Query("DELETE FROM calculations WHERE id = :id")
    suspend fun remove(id: String): Int
}

@Database(entities = [SavedCalculation::class], version = 1)
abstract class RibitDatabase : RoomDatabase() {
    abstract fun calculations(): CalculationDao

    companion object {
        @Volatile
        private var instance: RibitDatabase? = null

        fun get(context: Context): RibitDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                RibitDatabase::class.java,
                "ribit.db",
            ).build().also { instance = it }
        }
    }
}

class CalculationStore(context: Context) {
    private val dao = RibitDatabase.get(context).calculations()
    private val json = Json { encodeDefaults = true }

    val summaries: Flow<List<SavedSummary>> = dao.observeAll()

    suspend fun save(id: String?, title: String, planCount: Int, calculation: JsonObject): String {
        val savedId = id ?: UUID.randomUUID().toString()
        dao.save(snapshot(savedId, title, System.currentTimeMillis(), planCount, calculation))
        return savedId
    }

    suspend fun importAll(entries: List<BackupEntry>) {
        dao.insertAll(entries.map { entry ->
            snapshot(UUID.randomUUID().toString(), entry.title, entry.updatedAt, entry.planCount, entry.calculation)
        })
    }

    private fun snapshot(id: String, title: String, updatedAt: Long, planCount: Int, calculation: JsonObject): SavedCalculation {
        val encoded = json.encodeToString(calculation)
        val bytes = ByteArrayOutputStream()
        GZIPOutputStream(bytes).use { it.write(encoded.toByteArray(Charsets.UTF_8)) }
        return SavedCalculation(id, title, updatedAt, planCount, "gzip:" + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
    }

    suspend fun load(id: String): Pair<String, JsonObject>? {
        val entry = dao.find(id) ?: return null
        val source = if (entry.snapshot.startsWith("gzip:")) {
            val bytes = Base64.decode(entry.snapshot.removePrefix("gzip:"), Base64.NO_WRAP)
            GZIPInputStream(bytes.inputStream()).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } else {
            entry.snapshot
        }
        val calculation = json.decodeFromString<JsonObject>(source)
        when (calculation["modelVersion"]?.jsonPrimitive?.int ?: 1) {
            1 -> json.decodeFromString<Calculation>(source)
            2 -> Unit
            else -> error("Unsupported calculation format")
        }
        return entry.title to calculation
    }

    suspend fun remove(id: String) {
        dao.remove(id)
    }
}
